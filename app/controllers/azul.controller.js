/**
 * @author Sávio Muniz
 */
module.exports = {
    getFlightInfo: getFlightInfo,
};

const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
const exception = require('../util/services/exception');
const MESSAGES = require('../util/helpers/messages');
const validator = require('../util/helpers/validator');
const Proxy = require ('../util/services/proxy');
const Unicorn = require('../util/services/unicorn/unicorn');
const Airports = require('../util/airports/airports-data');
const PreFlightServices = require('../util/services/preflight');
const errorSolver = require('../util/helpers/error-solver');

async function getFlightInfo(req, res, next) {
    var startTime = (new Date()).getTime();

    console.log('Searching Azul...');
    try {
        var params = {
            IP: req.clientIp,
            client: req.clientName || "",
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
            infants: 0
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

        Formatter.responseFormat(azulResponse.redeemResponse, azulResponse.moneyResponse, params, 'azul').then(async function (formattedData) {
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

    return Promise.all([getCashResponse(params, token), getRedeemResponse(params, token)]).then(function (results) {
        if (results[0].err) {
            exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, results[0].err.stack, results[0].code, results[0].message, new Date());
            return null;
        }
        if (results[1].err) {
            exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, results[1].err.stack, results[1].code, results[1].message, new Date());
            return null;
        }
        return {moneyResponse: results[0], redeemResponse: results[1]};
    });
}

async function getCashResponse(params, token) {
    try {
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
