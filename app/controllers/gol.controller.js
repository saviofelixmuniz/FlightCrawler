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
var golAirport = require('../util/airports/airports-data').getGolAirport;
var smilesAirport = require('../util/airports/airports-data').getSmilesAirport;
const Unicorn = require('../util/services/unicorn/unicorn');

const HOST = 'https://flightavailability-prd.smiles.com.br';
const PATH = 'searchflights';


module.exports = getFlightInfo;

async function getFlightInfo(req, res, next) {
    const startTime = (new Date()).getTime();

    console.log('Searching Gol...');
    try {

        var params = {
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

        var cached = await db.getCachedResponse(params, new Date(), 'gol');
        if (cached) {
            var request = await db.saveRequest('gol', (new Date()).getTime() - startTime, params, null, 200, null);
            var cachedId = cached.id;
            delete cached.id;
            res.status(200);
            res.json({results: cached, cached: cachedId, id: request._id});
            return;
        }

        if (await db.checkUnicorn('gol')) {
            console.log('GOL: ...started UNICORN flow');
            var formattedData = await Unicorn(params, 'gol');
            res.json({results : formattedData});
            db.saveRequest('gol', (new Date()).getTime() - startTime, params, null, 200, formattedData);
            return;
        }

        var golResponse = await makeRequests(params, startTime, res);
        if (!golResponse || !golResponse.redeemResponse || !golResponse.moneyResponse) return;

        Formatter.responseFormat(golResponse.redeemResponse, golResponse.moneyResponse, params, 'gol').then(async function (formattedData) {
            if (formattedData.error) {
                exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                return;
            }

            if (!validator.isFlightAvailable(formattedData)) {
                exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                return;
            }

            var request = await db.saveRequest('gol', (new Date()).getTime() - startTime, params, null, 200, formattedData);
            res.status(200);
            res.json({results: formattedData, id: request._id});
        }, function (err) {
            throw err;
        });

    } catch (err) {
        exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, err, 400, MESSAGES.CRITICAL, new Date());
    }
}

function makeRequests(params, startTime, res) {
    return Promise.all([getCashResponse(params, startTime, res), getRedeemResponse(params, startTime, res)]).then(function (results) {
        if (results[0].err) {
            exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, results[0].err, results[0].code, results[0].message, new Date());
            return null;
        }
        if (results[1].err) {
            exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, results[1].err, results[1].code, results[1].message, new Date());
            return null;
        }
        return {moneyResponse: results[0], redeemResponse: results[1]};
    });
}

function getCashResponse(params, startTime, res) {
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'gol');
    var cookieJar = request.jar();

    var searchUrl = 'https://compre2.voegol.com.br/CSearch.aspx?culture=pt-br&size=small&color=default';

    var formData = {
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
                return {err: err, code: 500, message: MESSAGES.UNREACHABLE};
            });
        }
        else
            return {err: true, code: 404, message: MESSAGES.NO_AIRPORT};
    }).catch(function(err) {
        return {err: err, code: 500, message: MESSAGES.UNREACHABLE};
    });
}

function getRedeemResponse(params, startTime, res) {
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'gol');

    if (!smilesAirport(params.originAirportCode) || !smilesAirport(params.destinationAirportCode)) {
        return {err: true, code: 404, message: MESSAGES.NO_AIRPORT};
    }

    return request.post({
        url: 'https://api.smiles.com.br/api/oauth/token',
        form: {
            'grant_type': 'client_credentials',
            'client_id': Keys.smilesClientId,
            'client_secret': Keys.smilesClientSecret
        },
    }).then(async function (response) {
        try {
            var token = JSON.parse(response).access_token;
        } catch (e) {
            return {err: err, code: 500, message: MESSAGES.UNREACHABLE};
        }
        /*var url = `https://flightavailability-prd.smiles.com.br/searchflights?adults=${params.adults}&children=${params.children}&` +
            `departureDate=${params.departureDate}&destinationAirportCode=${params.destinationAirportCode}&forceCongener=false&infants=0&memberNumber=&` +
            `originAirportCode=${params.originAirportCode}&returnDate=${params.returnDate ? params.returnDate : ''}`;*/
        return request.get({
            url: Formatter.urlFormat(HOST, PATH, params),
            headers: {
                'x-api-key': Keys.smilesApiKey,
                'Authorization': 'Bearer ' + token
            },
            maxAttempts: 3,
            retryDelay: 150
        }).then(async function (response) {
            console.log('GOL:  ...got redeem read');
            var result = JSON.parse(response);
            if (params.originCountry !== params.destinationCountry) {
                params.forceCongener = 'true';
                var congenerFlights = JSON.parse(await request.get({
                    url: Formatter.urlFormat(HOST, PATH, params),
                    headers: {
                        'x-api-key': Keys.smilesApiKey,
                        'Authorization': 'Bearer ' + token
                    },
                    maxAttempts: 3,
                    retryDelay: 150
                }))["requestedFlightSegmentList"][0]["flightList"];
                var golFlights = result["requestedFlightSegmentList"][0]["flightList"];
                golFlights = golFlights.concat(congenerFlights);
                result["requestedFlightSegmentList"][0]["flightList"] = golFlights;
                console.log('GOL:  ...got congener redeem read');
            }

            return result;
        }).catch(function (err) {
            return {err: err, code: 500, message: MESSAGES.UNREACHABLE};
        });
    }).catch(function (err) {
        return {err: err, code: 500, message: MESSAGES.UNREACHABLE};
    });
}