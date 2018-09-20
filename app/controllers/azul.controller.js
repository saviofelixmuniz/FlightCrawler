/**
 * @author Sávio Muniz
 */
module.exports = {
    getFlightInfo: getFlightInfo,
    getEmissionReport: getEmissionReport,
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

async function getEmissionReport(req, res, next) {
    db.getEmissionReport(req.params.id).then(function (emissionReport) {
        if (emissionReport) res.json(emissionReport);
        else {
            res.status(404);
            res.json();
        }
    }).catch(function (err) {
        res.status(500);
        res.json();
    });
}

async function issueTicket(req, res, next) {
    var pSession = Proxy.createSession('azul');
    var data = req.body;
    var requested = await db.getRequest(data.request_id);
    var resources = await db.getRequestResources(data.request_id);
    resources = resources.resources;
    if (!requested || !resources) {
        res.status(404);
        res.json();
        return;
    }
    var emission = await db.createEmissionReport(data.request_id, 'azul');
    res.json(emission);

    var params = requested.params;
    const request = require("request-promise");
    var cookieJar = request.jar();
    var credentials = {
        "AgentName": data.credentials.login,
        "Password": data.credentials.password,
        "Device": 3
    };
    // Default login to get session
    Proxy.require({
        session: pSession,
        request: {url: 'https://webservices.voeazul.com.br/TudoAzulMobile/SessionManager.svc/Logon',
            headers: { 'Content-Type': 'application/json' },
            json: { 'AgentName': 'mobileadruser', 'Password': 'Azul2AdrM', 'DomainCode': 'EXT' },
            jar: cookieJar
        }
    }).then(async function (body) {
        var sessionId = body.SessionID;
        var session = '';
        for (var i = 0; i < sessionId.length; i++){
            if (i > 1 && Number(sessionId[i-1]) && sessionId[i-2] === '%') session += sessionId[i].toUpperCase();
            else session += sessionId[i];
        }
        await db.updateEmissionReport(emission._id, 1, null);
        // Real login
        Proxy.require({
            session: pSession,
            request: {url: 'https://webservices.voeazul.com.br/TudoAzulMobile/TudoAzulMobileManager.svc/LogonGetBalance',
                headers: { 'Content-Type': 'application/json' },
                json: credentials,
                jar: cookieJar
            }
        }).then(async function (body) {
            var userSession = body.LogonResponse.SessionID;
            var customerNumber = body.LogonResponse.CustomerNumber;
            await db.updateEmissionReport(emission._id, 2, null);


            var customerInfo = (await Proxy.require({
                session: pSession,
                request: {
                    url: 'https://webservices.voeazul.com.br/TudoAzulMobile/TudoAzulMobileManager.svc/GetAgent',
                    json: { CustomerNumber: customerNumber },
                    jar: cookieJar}
            }));
            if (!customerInfo) {
                db.updateEmissionReport(emission._id, 3, "Couldn't get customer info", true);
                return;
            }
            await db.updateEmissionReport(emission._id, 3, null);

            // Get all flights again (for a matter of cookies)
            var redeemUrl = `https://webservices.voeazul.com.br/TudoAzulMobile/LoyaltyManager.svc/GetAvailabilityByTrip?sessionId=${session}&userSession=${userSession}`;

            var redeemData = (await Proxy.require({
                session: pSession,
                request: {url: redeemUrl, json: Formatter.formatAzulRedeemForm(params), jar: cookieJar}
            }))["GetAvailabilityByTripResult"];
            if (!redeemData) {
                db.updateEmissionReport(emission._id, 4, "Couldn't get flights", true);
                return;
            }
            await db.updateEmissionReport(emission._id, 4, null);

            Proxy.require({
                session: pSession,
                request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/PriceItineraryByKeysV3?sessionId=${session}&userSession=${userSession}`,
                    headers: { 'Content-Type': 'application/json' },
                    json: Formatter.formatAzulItineraryForm(data, params, resources),
                    jar: cookieJar
                }
            }).then(async function (body) {
                var priceItineraryByKeys = body;
                await db.updateEmissionReport(emission._id, 5, null);

                Proxy.require({
                    session: pSession,
                    request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/SellByKeyV3?sessionId=${session}&userSession=${userSession}`,
                        headers: { 'Content-Type': 'application/json' },
                        json: Formatter.formatAzulSellForm(data, params, resources),
                        jar: cookieJar
                    }
                }).then(async function (body) {
                    if (!body || !body.SellByKeyV3Result || !body.SellByKeyV3Result.Result.Success) {
                        db.updateEmissionReport(emission._id, 6, "Couldn't get SellByKeyV3Result", true);
                        return;
                    }
                    var sellByKey = JSON.parse(body.SellByKeyV3Result.SellByKey);

                    var totalTax = 0;
                    for (var journey of sellByKey.JourneyServices) {
                        for (var fare of journey.Fares) {
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
                        PaymentMethodCode: data.payment.card_brand_code,
                        CurrencyCode: 'BRL',
                        ArrivalStation: params.destinationAirportCode,
                        DepartureStation: params.originAirportCode,
                        Amount: taxString
                    };
                    await db.updateEmissionReport(emission._id, 6, null);


                    var booking = (await Proxy.require({
                        session: pSession,
                        request: {
                            url: 'https://webservices.voeazul.com.br/ACSJson/Servicos/BookingService.svc/GetBookingFromState',
                            json: {signature: unescape(sessionId.replace(/\+/g, " ")), userInterface: 'mobileadruser'},
                            jar: cookieJar
                        }
                    }));

                    var setJourney = JSON.parse((await Proxy.require({
                        session: pSession,
                        request: {
                            url: 'https://webservices.voeazul.com.br/ACSJson/Servicos/BookingService.svc/setJourneyToUseMultiJourney?sessionId=' + sessionId,
                            json: {journeyToUse: 0},
                            jar: cookieJar
                        }
                    })).substring(1));
                    if (!setJourney || !setJourney.Resultado.Sucesso) {
                        db.updateEmissionReport(emission._id, 7, "Couldn't set journey", true);
                        return;
                    }
                    await db.updateEmissionReport(emission._id, 7, null);


                    Proxy.require({
                        session: pSession,
                        request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/GetPaymentInstallmentInfo`,
                            headers: { 'Content-Type': 'application/json' },
                            json: { paymentInstallmentInfoRequest: JSON.stringify(paymentInstallmentInfo) },
                            jar: cookieJar
                        }
                    }).then(async function (body) {
                        var paymentInstallmentInfoResult = JSON.parse(body.GetPaymentInstallmentInfoResult);

                        var commitResult = (await Proxy.require({
                            session: pSession,
                            request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/Commit`,
                                headers: { 'Content-Type': 'application/json' },
                                json: Formatter.formatAzulCommitForm(data, customerInfo, customerNumber, sessionId),
                                jar: cookieJar
                            }
                        }));
                        if (!commitResult) {
                            db.updateEmissionReport(emission._id, 8, "Couldn't get commit result", true);
                            return;
                        }
                        commitResult = JSON.parse(commitResult.CommitResult);
                        await db.updateEmissionReport(emission._id, 8, null);

                        var seatVoucher = JSON.parse((await Proxy.require({
                            session: pSession,
                            request: {url: `https://webservices.voeazul.com.br/ACSJson/Servicos/CheckinOperationService.svc/RedeemSeatVouchers?sessionId=${sessionId}&userSession=${userSession}`,
                                jar: cookieJar, method: 'POST'
                            }
                        })).substring(1));
                        if (!seatVoucher || !seatVoucher.Resultado.Sucesso) {
                            db.updateEmissionReport(emission._id, 9, "Couldn't redeem seat voucher", true);
                            return;
                        }
                        var payment = Formatter.formatAzulPaymentForm(data, params, totalTax, commitResult, priceItineraryByKeys, requested.response.Trechos);
                        await db.updateEmissionReport(emission._id, 9, null);

                        Proxy.require({
                            session: pSession,
                            request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/AddPayments?sessionId=${sessionId}&userSession=${userSession}`,
                                headers: { 'Content-Type': 'application/json' },
                                json: payment,
                                jar: cookieJar
                            }
                        }).then(async function (body) {
                            if (!body || !body.AddPaymentsResult.Result.Success) {
                                db.updateEmissionReport(emission._id, 10, "Something went wrong while paying", true);
                                return;
                            }
                            var paymentId = body.AddPaymentsResult.PaymentId;
                            await db.updateEmissionReport(emission._id, 10, null);

                            Proxy.require({
                                session: pSession,
                                request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/AddBookingToCustomer`,
                                    headers: { 'Content-Type': 'application/json' },
                                    json: {CustomerNumber: customerNumber, RecordLocators: [payment.addPaymentsRequest.RecordLocator]},
                                    jar: cookieJar
                                }
                            }).then(function (body) {
                                db.updateEmissionReport(emission._id, 11, null, true, {locator: payment.addPaymentsRequest.RecordLocator, payment_id: paymentId});
                            }).catch(function (err) {
                                db.updateEmissionReport(emission._id, 11, err.stack, true);
                            })
                        }).catch(function (err) {
                            db.updateEmissionReport(emission._id, 10, err.stack, true);
                        })
                    }).catch(function (err) {
                        db.updateEmissionReport(emission._id, 8, err.stack, true);
                    })
                }).catch(function (err) {
                    db.updateEmissionReport(emission._id, 6, err.stack, true);
                });
            }).catch(function (err) {
                db.updateEmissionReport(emission._id, 5, err.stack, true);
            });
        }).catch(function (err) {
            db.updateEmissionReport(emission._id, 2, err.stack, true);
        });
    }).catch(function (err) {
        db.updateEmissionReport(emission._id, 1, err.stack, true);
    });
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

            var resources = formattedData.resources;
            delete formattedData.resources;
            var request = await db.saveRequest('azul', (new Date()).getTime() - startTime, params, null, 200, formattedData);
            await db.saveRequestResources(request._id, null, null, resources);
            res.status(200);
            res.json({results: formattedData, id: request._id});
        });
    } catch (err) {
        errorSolver.solveFlightInfoErrors('azul', err, res, startTime, params);
    }
}

async function makeRequests(params) {
    var session = Proxy.createSession('azul');

    const creds = {
        "AgentName": "mobileadruser",
        "DomainCode": "EXT",
        "Password": "Azul2AdrM"
    };

    try {
        var token = (await Proxy.require({
            session: session,
            request: {
                url: "https://webservices.voeazul.com.br/TudoAzulMobile/SessionManager.svc/Logon",
                json: creds
            }
        }))['SessionID'];
    } catch (e) {
        throw e;
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

        var session = Proxy.createSession('azul');

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


        var cashData = JSON.parse((await Proxy.require({
            session: session,
            request: {
                url: cashUrl,
                json: payload
            }
        }))["GetAvailabilityByTripV2Result"]["Availability"]);

        console.log('AZUL:  ...got cash data');

        Proxy.killSession(session);
        return cashData;
    } catch (err) {
        Proxy.killSession(session);
        return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
    }
}

async function getRedeemResponse(params, token) {
    try {
        var session = Proxy.createSession('azul');

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

        var redeemData = (await Proxy.require({
            session: session,
            request: {
                url: redeemUrl,
                json: redeemParams
            }
        }))["GetAvailabilityByTripResult"];

        console.log('AZUL:  ...got redeem data');

        Proxy.killSession(session);
        return redeemData;
    } catch (err) {
        Proxy.killSession(session);
        return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
    }
}

async function getConfiancaResponse(params) {
    return Confianca(params);
}