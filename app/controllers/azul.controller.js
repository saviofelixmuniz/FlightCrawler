/**
 * @author Sávio Muniz
 */
module.exports = {
    getFlightInfo: getFlightInfo,
    issueTicket: issueTicket
};

const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
const exception = require('../util/services/exception');
const MESSAGES = require('../util/helpers/messages');
const validator = require('../util/helpers/validator');
const Proxy = require ('../util/services/proxy');
const Unicorn = require('../util/services/unicorn/unicorn');
const Airports = require('../util/airports/airports-data');
const Confianca = require('../util/helpers/confianca-crawler');
const PreFlightServices = require('../util/services/preflight');
const errorSolver = require('../util/helpers/error-solver');
const moment = require('moment');
const uuidv4 = require('uuid/v4');

async function issueTicket(req, res, next) {
    var data = req.body;
    var requested = await db.getRequest(data.requestId);
    if (!requested) {
        res.status(404);
        return;
    }
    var params = requested.params;
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'test');
    var cookieJar = request.jar();
    var credentials = {
        "AgentName": data.credentials.login,
        "Password": data.credentials.password,
        "Device": 3
    };
    request.post({url: 'https://webservices.voeazul.com.br/TudoAzulMobile/SessionManager.svc/Logon',
        headers: {
            'Content-Type': 'application/json'
        },
        json: {
            'AgentName': 'mobileadruser',
            'Password': 'Azul2AdrM',
            'DomainCode': 'EXT'
        },
        jar: cookieJar
    }).then(function (body) {
        var sessionId = body.SessionID;
        var session = '';
        for (var i = 0; i < sessionId.length; i++){
            if (i > 1 && Number(sessionId[i-1]) && sessionId[i-2] === '%') session += sessionId[i].toUpperCase();
            else session += sessionId[i];
        }
        request.post({url: 'https://webservices.voeazul.com.br/TudoAzulMobile/TudoAzulMobileManager.svc/LogonGetBalance',
            headers: {
                'Content-Type': 'application/json'
            },
            json: credentials,
            jar: cookieJar
        }).then(async function (body) {
            var userSession = body.LogonResponse.SessionID;
            var customerNumber = body.LogonResponse.CustomerNumber;

            var customerInfo = (await request.post({
                url: 'https://webservices.voeazul.com.br/TudoAzulMobile/TudoAzulMobileManager.svc/GetAgent',
                json: {CustomerNumber: customerNumber},
                jar: cookieJar}));
            if (!customerInfo) {
                res.status(500);
                return;
            }

            var redeemUrl = `https://webservices.voeazul.com.br/TudoAzulMobile/LoyaltyManager.svc/GetAvailabilityByTrip?sessionId=${session}&userSession=${userSession}`;

            var departureDate = params.departureDate.split('-');

            var paxPriceTypes = [];

            for (var i = 0; i<params.adults; i++) {
                paxPriceTypes.push('ADT')
            }

            for (var i = 0; i<params.children; i++) {
                paxPriceTypes.push('CHD')
            }

            var redeemParams = {
                "getAvailabilityByTripRequest": {
                    "AdultAmount": Number(params.adults),
                    "ChildAmount": Number(params.children),
                    "Device": 3,
                    "GetAllLoyalties": true,
                    "PointsOnly": false,
                    "TripAvailabilityRequest": {
                        "AvailabilityRequests": [{
                            "ArrivalStation": params.destinationAirportCode,
                            "BeginDateString": `${departureDate[0]}/${departureDate[1]}/${departureDate[2]} 16:13`,
                            "CurrencyCode": "BRL",
                            "DepartureStation": params.originAirportCode,
                            "EndDateString": `${departureDate[0]}/${departureDate[1]}/${departureDate[2]} 16:13`,
                            "FareClassControl": 1,
                            "FareTypes": ["P", "T", "R", "W"],
                            "FlightType": 5,
                            "MaximumConnectingFlights": 15,
                            "PaxCount": 1,
                            "PaxPriceTypes": paxPriceTypes
                        }]
                    }
                }
            };

            if (params.returnDate) {
                var returnDate = params.returnDate.split('-');

                var secondLegBody = {
                    "ArrivalStation": params.originAirportCode,
                    "BeginDateString": `${returnDate[0]}/${returnDate[1]}/${returnDate[2]} 16:13`,
                    "CurrencyCode": "BRL",
                    "DepartureStation": params.destinationAirportCode,
                    "EndDateString": `${returnDate[0]}/${returnDate[1]}/${returnDate[2]} 16:13`,
                    "FareClassControl": 1,
                    "FareTypes": ["P", "T", "R", "W"],
                    "FlightType": 5,
                    "MaximumConnectingFlights": 15,
                    "PaxCount": 1,
                    "PaxPriceTypes": paxPriceTypes
                };

                redeemParams["getAvailabilityByTripRequest"]["TripAvailabilityRequest"]["AvailabilityRequests"].push(secondLegBody);
            }

            var redeemData = (await request.post({url: redeemUrl, json: redeemParams, jar: cookieJar}))["GetAvailabilityByTripResult"];
            if (!redeemData) {
                res.status(500);
                return;
            }

            var form = {
                "priceItineraryByKeysV3Request": {
                    "BookingFlow": "1",
                    "JourneysAmountLevel": []
                }
            };
            var priceItineraryRequestWithKeys = {
                PaxResidentCountry: 'BR',
                CurrencyCode: 'BRL',
                Passengers: [],
                FareTypes:["P","T","R","W"],
                PriceKeys: [],
                SSRRequests: []
            };
            if (data.goingFlightInfo) {
                form.priceItineraryByKeysV3Request.JourneysAmountLevel.push({
                    "AmountLevel": 1,
                    "JourneySellKey": data.goingFlightInfo.JourneySellKey
                });
                priceItineraryRequestWithKeys.PriceKeys.push({
                    FareSellKey: data.goingFlightInfo.FareSellKey,
                    JourneySellKey: data.goingFlightInfo.JourneySellKey
                });
                priceItineraryRequestWithKeys.SSRRequests.push({FlightDesignator: data.goingFlightInfo.FlightDesignator});
            }
            if (data.returningFlightInfo) {
                form.priceItineraryByKeysV3Request.JourneysAmountLevel.push({
                    "AmountLevel": 1,
                    "JourneySellKey": data.returningFlightInfo.JourneySellKey
                });
                priceItineraryRequestWithKeys.PriceKeys.push({
                    FareSellKey: data.returningFlightInfo.FareSellKey,
                    JourneySellKey: data.returningFlightInfo.JourneySellKey
                });
                priceItineraryRequestWithKeys.SSRRequests.push({FlightDesignator: data.returningFlightInfo.FlightDesignator});
            }
            for (let i = 0; i < Number(params.adults); i++) {
                priceItineraryRequestWithKeys.Passengers.push({PassengerNumber: i, PaxPriceType: {PaxType: 'ADT'}})
            }
            for (let i = 0; i < Number(params.children); i++) {
                priceItineraryRequestWithKeys.Passengers.push({PassengerNumber: i, PaxPriceType: {PaxType: 'CHD'}})
            }
            form.priceItineraryByKeysV3Request["PriceItineraryRequestWithKeys"] = JSON.stringify(priceItineraryRequestWithKeys);

            request.post({url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/PriceItineraryByKeysV3?sessionId=${session}&userSession=${userSession}`,
                headers: {
                    'Content-Type': 'application/json'
                },
                json: form,
                jar: cookieJar
            }).then(function (body) {
                var priceItineraryByKeys = body;
                var sellByKeyForm = {
                    sellByKeyV3Request: {
                        BookingFlow: "1",
                        AmountLevels: []
                    }
                };
                var sellRequestWithKeys = {
                    PaxCount: Number(params.children) + Number(params.adults),
                    PaxResidentCountry: 'BR',
                    CurrencyCode: 'BRL',
                    PaxPriceTypes: [],
                    SourceOrganization: 'AD',
                    ActionStatusCode: 'NN',
                    SellKeyList: []
                };
                for (var i = 0; i < Number(params.adults); i++) {
                    sellRequestWithKeys.PaxPriceTypes.push({"PaxType": "ADT"})
                }
                for (var i = 0; i < Number(params.children); i++) {
                    sellRequestWithKeys.PaxPriceTypes.push({"PaxType": "CHD"})
                }
                if (data.goingFlightInfo) {
                    sellByKeyForm.sellByKeyV3Request.AmountLevels.push(1);
                    sellRequestWithKeys.SellKeyList.push({
                        JourneySellKey: data.goingFlightInfo.JourneySellKey,
                        FareSellKey: data.goingFlightInfo.FareSellKey
                    });
                }
                if (data.returningFlightInfo) {
                    sellByKeyForm.sellByKeyV3Request.AmountLevels.push(1);
                    sellRequestWithKeys.SellKeyList.push({
                        JourneySellKey: data.returningFlightInfo.JourneySellKey,
                        FareSellKey: data.returningFlightInfo.FareSellKey
                    });
                }
                sellByKeyForm.sellByKeyV3Request.SellRequestWithKeys = JSON.stringify(sellRequestWithKeys);
                request.post({url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/SellByKeyV3?sessionId=${session}&userSession=${userSession}`,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    json: sellByKeyForm,
                    jar: cookieJar
                }).then(async function (body) {
                    if (!body || !body.SellByKeyV3Result || !body.SellByKeyV3Result.Result.Success) {
                        res.status(500);
                        return;
                    }
                    var sellByKey = JSON.parse(body.SellByKeyV3Result.SellByKey);

                    var totalTax = 0;
                    for (var jorney of sellByKey.JourneyServices) {
                        for (var fare of jorney.Fares) {
                            for (var paxFare of fare.PaxFares) {
                                for (var charge of paxFare.InternalServiceCharges) {
                                    if (charge.ChargeCode === 'TXE') {
                                        totalTax += charge.Amount;
                                    }
                                }
                            }
                        }
                    }

                    var taxString = totalTax.toFixed(2).replace('.', '');

                    var paymentInstallmentInfo = {
                        TaxAmount: taxString,
                        PaymentMethodCode: data.payment.cardBrandCode,
                        CurrencyCode: 'BRL',
                        ArrivalStation: params.destinationAirportCode,
                        DepartureStation: params.originAirportCode,
                        Amount: taxString
                    };
                    var booking = (await request.post({
                        url: 'https://webservices.voeazul.com.br/ACSJson/Servicos/BookingService.svc/GetBookingFromState',
                        json: {signature: unescape(sessionId.replace(/\+/g, " ")), userInterface: 'mobileadruser'},
                        jar: cookieJar
                    }));
                    var setJourney = JSON.parse((await request.post({
                        url: 'https://webservices.voeazul.com.br/ACSJson/Servicos/BookingService.svc/setJourneyToUseMultiJourney?sessionId=' + sessionId,
                        json: {journeyToUse: 0},
                        jar: cookieJar
                    })).substring(1));
                    if (!setJourney || !setJourney.Resultado.Sucesso) {
                        res.status(500);
                        res.json();
                        return;
                    }

                    request.post({url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/GetPaymentInstallmentInfo`,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        json: { paymentInstallmentInfoRequest: JSON.stringify(paymentInstallmentInfo) },
                        jar: cookieJar
                    }).then(async function (body) {
                        var paymentInstallmentInfoResult = JSON.parse(body.GetPaymentInstallmentInfoResult);

                        var bookingRequest = {
                            BookingContacts: [],
                            BookingPassengers: data.passengers,
                            ChangeHoldDateTime: false,
                            CommitAction: "0",
                            CurrencyCode: "BRL",
                            DistributeToContacts: false,
                            DistributionOption: "0",
                            PaxResidentCountry: "BR",
                            ReceivedBy: "AndroidApp",
                            RestrictionOverride: false,
                            WaiveNameChangeFee: false
                        };
                        var commit = {
                            bookingHold: false
                        };
                        var customerContact = {
                            AddressLine1: customerInfo.Address.AddressLine1,
                            AddressLine2: customerInfo.Address.AddressLine2,
                            AddressLine3: customerInfo.Address.AddressLine3,
                            City: customerInfo.Address.City,
                            CountryCode: customerInfo.Address.Country,
                            CultureCode: 'pt-BR',
                            CustomerNumber: customerNumber,
                            DistributionOption: '0',
                            EmailAddress: customerInfo.Email,
                            HomePhone: customerInfo.Address.PhoneNumber,
                            Name: {FirstName: customerInfo.FirstName, LastName: customerInfo.LastName},
                            NotificationPreference: '1',
                            PostalCode: customerInfo.Address.ZipCode,
                            ProvinceState: customerInfo.Address.State,
                            State: '1',
                            TypeCode: 'P'
                        };
                        bookingRequest.BookingContacts.push(customerContact);
                        commit.bookingRequest = JSON.stringify(bookingRequest);

                        var sessionContext = { SecureToken: sessionId };
                        commit.sessionContext = JSON.stringify(sessionContext);

                        var commitResult = (await request.post({url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/Commit`,
                            headers: { 'Content-Type': 'application/json' },
                            json: commit,
                            jar: cookieJar
                        }));
                        if (!commitResult) {
                            res.status(500);
                            return;
                        }
                        commitResult = JSON.parse(commitResult.CommitResult);

                        var seatVoucher = JSON.parse((await request.post({url: `https://webservices.voeazul.com.br/ACSJson/Servicos/CheckinOperationService.svc/RedeemSeatVouchers?sessionId=${sessionId}&userSession=${userSession}`,
                            jar: cookieJar
                        })).substring(1));
                        if (!seatVoucher || !seatVoucher.Resultado.Sucesso) {
                            res.status(500);
                            return;
                        }

                        var cardExpDate = new Date(Number(data.payment.cardExpirationDate.split('/')[1]),
                            Number(data.payment.cardExpirationDate.split('/')[0]) - 1, 0);
                        cardExpDate.setHours(cardExpDate.getHours() + 21);
                        var payment = {
                            addPaymentsRequest: {
                                Commit: {
                                    Comments: [{
                                        CommentText: "Criado por MobileAndroidAPP 3.0 - v3.19.4",
                                        CommentType: "0"
                                    }, {
                                        CommentText: "CYBERSOURCE ID: 56965896-e71a-410b-9f7a-94b83e8ee3dd",
                                        CommentType: "0"
                                    }, {
                                        CommentText: "Mobile CybersourceID:f7e9cc0e-68aa-44b0-9769-045a6fccea75",
                                        CommentType: "0"
                                    }],
                                    CommitAction: "0",
                                    CurrencyCode: "BRL",
                                    PaxResidentCountry: "BR",
                                    ReceivedBy: "AndroidApp"
                                },
                                Device: 3,
                                PayPoints: [],
                                Payment: {
                                    AccountNumber: data.payment.cardNumber,
                                    AuthorizationStatus: "0",
                                    ChannelType: "4",
                                    CurrencyCode: "BRL",
                                    DCCStatus: "0",
                                    Expiration: `/Date(${cardExpDate.getTime()})/`,
                                    Installments: 1,
                                    PaymentFields: [
                                        {
                                            "FieldName": "CC::VerificationCode",
                                            "FieldValue": data.payment.cardSecurityCode
                                        }, {
                                            "FieldName": "CC::AccountHolderName",
                                            "FieldValue": data.payment.cardName
                                        }, {
                                            "FieldName": "EXPDAT",
                                            "FieldValue": moment(cardExpDate).format('ddd MMM DD hh:mm:ss Z YYYY')
                                        }, {
                                            "FieldName": "AMT",
                                            "FieldValue": String(totalTax)
                                        }, {
                                            "FieldName": "ACCTNO",
                                            "FieldValue": data.payment.cardNumber
                                        }, {
                                            "FieldName": "NPARC",
                                            "FieldValue": "1"
                                        }, {
                                            "FieldName": "CPF",
                                            "FieldValue": data.payment.CPF
                                        }
                                    ],
                                    "PaymentMethodCode": data.payment.cardBrandCode,
                                    "PaymentMethodType": "1",
                                    "PaymentText": "-",
                                    "QuotedAmount": totalTax,
                                    "QuotedCurrencyCode": "BRL",
                                    "ReferenceType": "0",
                                    "Status": "0",
                                    "Transferred": false,
                                    "WaiveFee": false
                                },
                                "RecordLocator": commitResult.RecordLocator,
                                "SegmentSeatRequest": []
                            }
                        };

                        for (var itinerary of priceItineraryByKeys.PriceItineraryByKeysV3Result.JourneysItineraryPriceId) {
                            var flight = getFlightBySellKey(itinerary.JourneySellKey, requested.response.Trechos);
                            if (!flight) {
                                res.status(400);
                                return;
                            }
                            var fare;
                            for (var f of flight.Milhas) {
                                if ((flight.Sentido === 'ida' && f.FareSellKey === data.goingFlightInfo.FareSellKey) ||
                                    (flight.Sentido === 'volta' && f.FareSellKey === data.returningFlightInfo.FareSellKey)) {
                                    fare = f;
                                    break;
                                }
                            }
                            if (!fare) {
                                res.status(400);
                                return;
                            }
                            var flightInfo = {
                                AmountLevel: 1,
                                ArrivalStation: flight.Destino,
                                DepartureStation: flight.Origem,
                                FareSellKey: fare.FareSellKey,
                                ItineraryPriceId: itinerary.ItineraryPriceId,
                                JourneySellKey: itinerary.JourneySellKey,
                                PaxPointsPaxesTypes: [
                                    {
                                        Amount: 0,
                                        PaxCount: Number(params.adults),
                                        PaxType: 'ADT',
                                        Points: fare.Adulto
                                    }
                                ],
                                TransactionId: uuidv4()
                            };
                            if (Number(params.children)) {
                                flightInfo.PaxPointsPaxesTypes.push({
                                    Amount: 0,
                                    PaxCount: Number(params.children),
                                    PaxType: 'CHD',
                                    Points: fare.Crianca
                                });
                            }
                            payment.addPaymentsRequest.PayPoints.push(flightInfo);
                        }
                        debugger;
                        request.post({url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/AddPayments?sessionId=${sessionId}&userSession=${userSession}`,
                            headers: { 'Content-Type': 'application/json' },
                            json: payment,
                            jar: cookieJar
                        }).then(function (body) {
                            debugger;
                            request.post({url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/AddBookingToCustomer`,
                                headers: { 'Content-Type': 'application/json' },
                                json: {CustomerNumber: customerNumber, RecordLocators: [payment.addPaymentsRequest.RecordLocator]},
                                jar: cookieJar
                            }).then(function (body) {
                                debugger;
                                res.status(200);
                                res.json();
                            }).catch(function (err) {
                                debugger;
                                res.status(500);
                                return;
                            })
                        }).catch(function (err) {
                            debugger;
                            res.status(500);
                            return;
                        })
                    }).catch(function (err) {
                        debugger;
                        res.status(500);
                        return;
                    })
                }).catch(function (err) {
                    debugger;
                    res.status(500);
                    return;
                });
            }).catch(function (err) {
                debugger;
                res.status(500);
                return;
            });
        }).catch(function (err) {
            debugger;
            res.status(500);
            return;
        });
    }).catch(function (err) {
        debugger;
        res.status(500);
    });
}

function getFlightBySellKey(journeyKey, stretches) {
    for (var stretch in stretches) {
        for (var flight of stretches[stretch].Voos) {
            if (flight.JourneySellKey === journeyKey) return flight;
        }
    }

    return null;
}

async function getFlightInfo(req, res, next) {
    var startTime = (new Date()).getTime();

    console.log('Searching Azul...');
    try {
        var params = {
            IP: req.clientIp,
            api_key: req.headers['authorization'],
            adults: req.query.adults,
            children: req.query.children ? req.query.children : '0',
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            originCountry: req.query.originCountry || 'BR',
            destinationCountry: req.query.destinationCountry || 'BR',
            forceCongener: false,
            executive: req.query.executive === 'true',
            infants: 0,
            confianca: false
        };

        var originAirport = Airports.getAzulAirport(params.originAirportCode);
        var destinationAirport = Airports.getAzulAirport(params.destinationAirportCode);
        if (originAirport && destinationAirport) {
            if (originAirport.code !== params.originAirportCode) {
                params.originAirportCode = originAirport.code;
            }
            if (destinationAirport.code !== params.destinationAirportCode) {
                params.destinationAirportCode = destinationAirport.code;
            }
        }
        if (!originAirport || !destinationAirport || originAirport.searchCode !== '1N' || destinationAirport.searchCode !== '1N') {
            exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, null, 404, MESSAGES.NO_AIRPORT, new Date());
            return;
        }

        if (await PreFlightServices(params, startTime, 'azul', res)) {
            return;
        }

        var azulResponse = await makeRequests(params, startTime, res);
        if (!azulResponse || !azulResponse.redeemResponse || !azulResponse.moneyResponse) return;

        Formatter.responseFormat(azulResponse.redeemResponse, azulResponse.moneyResponse, azulResponse.confiancaResponse, params, 'azul').then(async function (formattedData) {
            if (formattedData.error) {
                exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, formattedData.error, 500, MESSAGES.PARSE_ERROR, new Date());
                return;
            }

            if (!validator.isFlightAvailable(formattedData)) {
                exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                return;
            }

            var request = await db.saveRequest('azul', (new Date()).getTime() - startTime, params, null, 200, formattedData);
            res.status(200);
            res.json({results: formattedData, id: request._id});
        });
    } catch (err) {
        errorSolver.solveFlightInfoErrors('azul', err, res, startTime, params);
    }
}

async function makeRequests(params) {
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'test');

    const creds = {
        "AgentName": "mobileadruser",
        "DomainCode": "EXT",
        "Password": "Azul2AdrM"
    };

    try {
        var token = (await request.post({
            url: "https://webservices.voeazul.com.br/TudoAzulMobile/SessionManager.svc/Logon",
            json: creds
        }))['SessionID'];
    } catch (e) {
        if (e.name === "RequestError") {
            let status = errorSolver.getHttpStatusCodeFromMSG(e.message);
            let code = parseInt(status);
            throw {err: true, code: code, message: e.message, stack : e.stack};
        } else {
            throw e;
        }

    }
    console.log('AZUL:  ...got session token');

    return Promise.all([getCashResponse(params, token), getRedeemResponse(params, token), getConfiancaResponse(params)]).then(function (results) {
        if (results[0].err) {
            exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, results[0].err.stack, results[0].code, results[0].message, new Date());
            return null;
        }
        if (results[1].err) {
            exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, results[1].err.stack, results[1].code, results[1].message, new Date());
            return null;
        }
        return {moneyResponse: results[0], redeemResponse: results[1], confiancaResponse: results[2]};
    });
}

async function getCashResponse(params, token) {
    try {
        if(params.confianca === true) {
            return {
                Schedules: [[], []]
            };
        }

        var request = Proxy.setupAndRotateRequestLib('request-promise', 'test');

        var cashUrl = `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/GetAvailabilityByTripV2?sessionId=${token}&userSession=`;

        var paxPriceTypes = [];

        for (var i = 0; i < params.adults; i++) {
            paxPriceTypes.push({"PaxType": "ADT"})
        }

        for (var i = 0; i < params.children; i++) {
            paxPriceTypes.push({"PaxType": "CHD"})
        }

        var cashParams = {
            "AvailabilityRequests": [
                {
                    "BeginDate": `${params.departureDate}T16:13:50`,
                    "PaxCount": Number(params.adults) + Number(params.children),
                    "EndDate": `${params.departureDate}T16:13:50`,
                    "ArrivalStation": `${params.destinationAirportCode}`,
                    "DepartureStation": `${params.originAirportCode}`,
                    "MaximumConnectingFlights": 15,
                    "CurrencyCode": "BRL",
                    "FlightType": "5",
                    "PaxPriceTypes": paxPriceTypes,
                    "FareClassControl": 1,
                    "FareTypes": ["P", "T", "R", "W"]
                }
            ]
        };

        if (params.returnDate) {
            var secondLegBody = {
                "BeginDate": `${params.returnDate}T16:13:53`,
                "PaxCount": Number(params.adults) + Number(params.children),
                "EndDate": `${params.returnDate}T16:13:53`,
                "ArrivalStation": `${params.originAirportCode}`,
                "DepartureStation": `${params.destinationAirportCode}`,
                "MaximumConnectingFlights": 15,
                "CurrencyCode": "BRL",
                "FlightType": "5",
                "PaxPriceTypes": paxPriceTypes,
                "FareClassControl": 1,
                "FareTypes": ["P", "T", "R", "W"]
            };

            cashParams["AvailabilityRequests"].push(secondLegBody);
        }

        var payload = {
            "getAvailabilityByTripV2Request": {
                "BookingFlow": "0",
                "TripAvailabilityRequest": JSON.stringify(cashParams)
            }
        };

        var cashData = JSON.parse((await request.post({
            url: cashUrl,
            json: payload
        }))["GetAvailabilityByTripV2Result"]["Availability"]);

        console.log('AZUL:  ...got cash data');

        return cashData;
    } catch (err) {
        return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
    }
}

async function getRedeemResponse(params, token) {
    try {
        var request = Proxy.setupAndRotateRequestLib('request-promise', 'test');

        var redeemUrl = `https://webservices.voeazul.com.br/TudoAzulMobile/LoyaltyManager.svc/GetAvailabilityByTrip?sessionId=${token}&userSession=`;

        var departureDate = params.departureDate.split('-');

        var paxPriceTypes = [];

        for (var i = 0; i<params.adults; i++) {
            paxPriceTypes.push('ADT')
        }

        for (var i = 0; i<params.children; i++) {
            paxPriceTypes.push('CHD')
        }

        var redeemParams = {
            "getAvailabilityByTripRequest": {
                "AdultAmount": Number(params.adults),
                "ChildAmount": Number(params.children),
                "Device": 3,
                "GetAllLoyalties": true,
                "PointsOnly": false,
                "TripAvailabilityRequest": {
                    "AvailabilityRequests": [{
                        "ArrivalStation": params.destinationAirportCode,
                        "BeginDateString": `${departureDate[0]}/${departureDate[1]}/${departureDate[2]} 16:13`,
                        "CurrencyCode": "BRL",
                        "DepartureStation": params.originAirportCode,
                        "EndDateString": `${departureDate[0]}/${departureDate[1]}/${departureDate[2]} 16:13`,
                        "FareClassControl": 1,
                        "FareTypes": ["P", "T", "R", "W"],
                        "FlightType": 5,
                        "MaximumConnectingFlights": 15,
                        "PaxCount": 1,
                        "PaxPriceTypes": paxPriceTypes
                    }]
                }
            }
        };

        if (params.returnDate) {
            var returnDate = params.returnDate.split('-');

            var secondLegBody = {
                "ArrivalStation": params.originAirportCode,
                "BeginDateString": `${returnDate[0]}/${returnDate[1]}/${returnDate[2]} 16:13`,
                "CurrencyCode": "BRL",
                "DepartureStation": params.destinationAirportCode,
                "EndDateString": `${returnDate[0]}/${returnDate[1]}/${returnDate[2]} 16:13`,
                "FareClassControl": 1,
                "FareTypes": ["P", "T", "R", "W"],
                "FlightType": 5,
                "MaximumConnectingFlights": 15,
                "PaxCount": 1,
                "PaxPriceTypes": paxPriceTypes
            };

            redeemParams["getAvailabilityByTripRequest"]["TripAvailabilityRequest"]["AvailabilityRequests"].push(secondLegBody);
        }

        var redeemData = (await request.post({url: redeemUrl, json: redeemParams}))["GetAvailabilityByTripResult"];

        console.log('AZUL:  ...got redeem data');

        return redeemData;
    } catch (err) {
        return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
    }
}

async function getConfiancaResponse(params) {
    return Confianca(params);
}

