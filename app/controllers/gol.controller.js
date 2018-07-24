/**
 * @author Sávio Muniz
 */

const Formatter = require('../util/helpers/format.helper');
const validator = require('../util/helpers/validator');
const exception = require('../util/services/exception');
const MESSAGES = require('../util/helpers/messages');
const Proxy = require ('../util/services/proxy');
const Keys = require('../configs/keys');
const db = require('../util/services/db-helper');
let golAirport = require('../util/airports/airports-data').getGolAirport;
let smilesAirport = require('../util/airports/airports-data').getSmilesAirport;
const Unicorn = require('../util/services/unicorn/unicorn');

const HOST = 'https://flightavailability-prd.smiles.com.br';
const PATH = 'searchflights';


module.exports = getFlightInfo;

async function getFlightInfo(req, res, next) {
    const startTime = (new Date()).getTime();

    console.log('Searching Gol...');
    try {

        let params = {
            IP: req.clientIp,
            api_key: req.headers['authorization'],
            adults: req.query.adults,
            children: req.query.children ? req.query.children : '0',
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate ? req.query.returnDate : null,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            forceCongener: 'false',
            originCountry: req.query.originCountry || 'BR',
            destinationCountry: req.query.destinationCountry || 'BR',
            infants: 0
        };

        let cached = await db.getCachedResponse(params, new Date(), 'gol');
        if (cached) {
            db.saveRequest('gol', (new Date()).getTime() - startTime, params, null, 200, null);
            res.status(200);
            res.json({results: cached});
            return;
        }

        if (db.checkUnicorn('gol')) {
            console.log('GOL: ...started UNICORN flow');
            let formattedData = await Unicorn(params, 'gol');
            res.json({results : formattedData});
            db.saveRequest('gol', (new Date()).getTime() - startTime, params, null, 200, formattedData);
            return;
        }

        let golResponse = await makeRequests(params, startTime, res);

        Formatter.responseFormat(golResponse.redeemResponse, golResponse.moneyResponse, params, 'gol').then(function (formattedData) {
            if (formattedData.error) {
                exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                return;
            }

            if (!validator.isFlightAvailable(formattedData)) {
                exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                return;
            }

            res.json({results: formattedData});
            db.saveRequest('gol', (new Date()).getTime() - startTime, params, null, 200, formattedData);
        }, function (err) {
            throw err;
        });

    } catch (err) {
        exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, err, 400, MESSAGES.CRITICAL, new Date());
    }
}

function makeRequests(params, startTime, res) {
    return Promise.all([getCashResponse(params, startTime, res),getRedeemResponse(params, startTime, res)]).then(function (results) {
        return {moneyResponse: results[0], redeemResponse: results[1]};
    });
}

function getCashResponse(params, startTime, res) {
    let request = Proxy.setupAndRotateRequestLib('request-promise', 'gol');
    let cookieJar = request.jar();

    let searchUrl = 'https://compre2.voegol.com.br/CSearch.aspx?culture=pt-br&size=small&color=default';

    let formData = {
        "header-chosen-origin": "",
        "destiny-hidden": 'false',
        "header-chosen-destiny": "",
        "goBack": params.returnDate ? "goAndBack" : "goOrBack",
        "promotional-code": "",
        "ControlGroupSearchView$AvailabilitySearchInputSearchView$TextBoxMarketOrigin1": `${params.originAirportCode}`,
        "ControlGroupSearchView$AvailabilitySearchInputSearchView$TextBoxMarketDestination1": `${params.destinationAirportCode}`,
        "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListMarketDay1": `${params.departureDate.split('-')[2]}`,
        "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListMarketMonth1": `${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
        "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListMarketDay2": params.returnDate ? params.returnDate.split('-')[2] : '17',
        "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListMarketMonth2": params.returnDate ? `${params.returnDate.split('-')[0]}-${params.returnDate.split('-')[1]}` : '2018-08',
        "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListPassengerType_ADT": 1,
        "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListPassengerType_CHD": params.children ? params.children : 0,
        "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListPassengerType_INFT": 0,
        "ControlGroupSearchView$AvailabilitySearchInputSearchView$RadioButtonMarketStructure": params.returnDate ? "RoundTrip" : 'OneWay',
        "PageFooter_SearchView$DropDownListOriginCountry": "pt",
        "ControlGroupSearchView$ButtonSubmit": "compre aqui",
        "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListResidentCountry": "br",
        "SmilesAndMoney": "False",
        "__EVENTARGUMENT": "",
        "__EVENTTARGET": "",
        "size": "small"
    };

    return request.post({
        url: searchUrl,
        form: formData,
        jar: cookieJar,
        rejectUnauthorized: false
    }).then(function () {
        console.log('GOL:  ...made redeem post');

        if (golAirport(params.originAirportCode) && golAirport(params.destinationAirportCode)) {
            return request.get({
                url: 'https://compre2.voegol.com.br/Select2.aspx',
                jar: cookieJar,
                rejectUnauthorized: false
            }).then(function (body) {
                console.log('GOL:  ...got cash read');

                return body;
            }).catch(function (err) {
                exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, err, 500, MESSAGES.UNREACHABLE, new Date());
            });
        }

        else
            return null;
    }).catch(function(err) {
        exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, err, 500, MESSAGES.UNREACHABLE, new Date());
    });
}

function getRedeemResponse(params, startTime, res) {
    let request = Proxy.setupAndRotateRequestLib('request-promise', 'gol');

    if (!smilesAirport(params.originAirportCode) || !smilesAirport(params.destinationAirportCode)) {
        exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, null, 404, MESSAGES.NO_AIRPORT, new Date());
        return;
    }

    return request.get({
        url: Formatter.urlFormat(HOST, PATH, params),
        headers: {
            'x-api-key': Keys.golApiKey
        },
        maxAttempts: 3,
        retryDelay: 150
    }).then(async function (response) {
        console.log('GOL:  ...got redeem read');
        let result = JSON.parse(response);

        if (params.originCountry !== params.destinationCountry) {
            params.forceCongener = 'true';
            let congenerFlights = JSON.parse(await request.get({
                url: Formatter.urlFormat(HOST, PATH, params),
                headers: {
                    'x-api-key': Keys.golApiKey
                },
                maxAttempts: 3,
                retryDelay: 150
            }))["requestedFlightSegmentList"][0]["flightList"];
            debugger;
            let golFlights = result["requestedFlightSegmentList"][0]["flightList"];
            golFlights = golFlights.concat(congenerFlights);
            result["requestedFlightSegmentList"][0]["flightList"] = golFlights;
            console.log('GOL:  ...got congener redeem read');
        }

        return result;
    }).catch(function (err) {
        exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, err, 500, MESSAGES.UNREACHABLE, new Date());
    });
}