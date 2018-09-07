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
                'Content-Type': 'application/json',
                'X-App-Version': '3.19.3',
                'Host': 'webservices.voeazul.com.br',
                'Connection': 'Keep-Alive',
                'User-Agent': 'android-async-http/1.4.4 (http://loopj.com/android-async-http)',
                'Accept-Encoding': 'br'
            },
            json: credentials,
            jar: cookieJar
        }).then(async function (body) {
            var userSession = body.LogonResponse.SessionID;
            var customerNumber = body.LogonResponse.CustomerNumber;

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
            debugger;
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
            debugger;
            request.post({url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/PriceItineraryByKeysV3?sessionId=${session}&userSession=${userSession}`,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': 934,
                    'Host': 'webservices.voeazul.com.br',
                    'Connection': 'Keep-Alive',
                    'Accept-Encoding': 'gzip',
                    'User-Agent': 'okhttp/3.4.1'
                },
                json: form,
                gzip: true,
                jar: cookieJar
            }).then(function (body) {
                debugger;
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
                debugger;
                request.post({url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/SellByKeyV3?sessionId=${session}&userSession=${userSession}`,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    json: sellByKeyForm,
                    jar: cookieJar
                }).then(function (body) {
                    debugger;

                }).catch(function (err) {
                    res.status(500);
                });
            }).catch(function (err) {
                res.status(500);
            });
        }).catch(function (err) {
            debugger;
            res.status(500);
        });
    }).catch(function (err) {
        debugger;
        res.status(500);
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
            confianca: req.query.confianca === 'true'
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

        var cached = await db.getCachedResponse(params, new Date(), 'azul');
        if (cached) {
            var request = await db.saveRequest('azul', (new Date()).getTime() - startTime, params, null, 200, null);
            var cachedId = cached.id;
            delete cached.id;
            res.status(200);
            res.json({results: cached, cached: cachedId, id: request._id});
            return;
        }

        if (await db.checkUnicorn('azul')) {
            console.log('AZUL: ...started UNICORN flow');
            var formattedData = await Unicorn(params, 'azul');
            res.json({results : formattedData});
            db.saveRequest('azul', (new Date()).getTime() - startTime, params, null, 200, formattedData);
            return;
        }

        var azulResponse = await makeRequests(params, startTime, res);
        if (!azulResponse || !azulResponse.redeemResponse || !azulResponse.moneyResponse) return;

        Formatter.responseFormat(azulResponse.redeemResponse, azulResponse.moneyResponse, azulResponse.confiancaResponse, params, 'azul').then(async function (formattedData) {
            if (formattedData.error) {
                exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
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
        console.log(err);
        exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 400, MESSAGES.CRITICAL, new Date())
    }
}

async function makeRequests(params) {
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'test');

    const creds = {
        "AgentName": "mobileadruser",
        "DomainCode": "EXT",
        "Password": "Azul2AdrM"
    };

    var token = (await request.post({
        url: "https://webservices.voeazul.com.br/TudoAzulMobile/SessionManager.svc/Logon",
        json: creds
    }))['SessionID'];

    console.log('AZUL:  ...got session token');

    return Promise.all([getCashResponse(params, token), getRedeemResponse(params, token), getConfiancaResponse(params)]).then(function (results) {
        if (results[0].err) {
            exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, results[0].err, results[0].code, results[0].message, new Date());
            return null;
        }
        if (results[1].err) {
            exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, results[1].err, results[1].code, results[1].message, new Date());
            return null;
        }
        return {moneyResponse: results[0], redeemResponse: results[1], confiancaResponse: results[2]};
    });
}

async function getCashResponse(params, token) {
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
}

async function getRedeemResponse(params, token) {
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
}

async function getConfiancaResponse(params) {
    return Confianca(params);
}