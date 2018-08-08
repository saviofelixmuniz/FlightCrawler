/**
 * @author Sávio Muniz
 */
var express = require('express');
var Proxy = require('../util/services/proxy');
var test = require('../util/airports/taxes/tax-crawler');
var Confianca = require('../util/helpers/confianca-crawler');
var rootRouter = express.Router();
var Airports = require('../db/models/airports');
var taxObtainer = require('../util/airports/taxes/tax-obtainer');
var gol = require('./flight/gol.route');
var avianca = require('./flight/avianca.route');
var azul = require('./flight/azul.route');
var latam = require('./flight/latam.route');
var stats = require('./flight/stats.route');
var skymilhas = require('./flight/skymilhas');
var auth = require('./flight/auth.route');
var cheerio = require('cheerio');
var rp = require('request-promise');

rootRouter.get('/', function(req, res, next) {
    res.send('respond with a resource');
});

rootRouter.use('/gol', gol);
rootRouter.use('/avianca',avianca);
rootRouter.use('/azul',azul);
rootRouter.use('/latam',latam);
rootRouter.use('/skymilhas',skymilhas);

rootRouter.use('/stats', stats);
rootRouter.use('/auth', auth);

rootRouter.get('/test', async function oi (req, res) {
    var params = {
        adults: Number(req.query.adults),
        children: Number(req.query.children ? req.query.children : 0),
        departureDate: req.query.departureDate,
        returnDate: req.query.returnDate,
        originAirportCode: req.query.originAirportCode,
        destinationAirportCode: req.query.destinationAirportCode,
        originCountry: req.query.originCountry || 'BR',
        destinationCountry: req.query.destinationCountry || 'BR',
        infants: 0
    };

    res.send(await makeRequests(params));
});

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

    return Promise.all([getCashResponse(params, token), getRedeemResponse(params, token)]).then(function (results) {
        return {moneyResponse: results[0], redeemResponse: results[1]};
    });
}

async function getCashResponse(params, token) {
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
                "PaxCount": params.adults + params.children,
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
            "PaxCount": params.adults + params.children,
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
    return redeemData;
}



rootRouter.get('/proxytest', async function proxyTest (req, res) {
    var ip = await Proxy.setupAndRotateRequestLib('request-promise', 'onecompany').get('https://api.ipify.org?format=json');
    res.json(JSON.parse(ip));
});

module.exports = rootRouter;

