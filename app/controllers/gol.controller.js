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
var exif = require('exif');
var cheerio = require('cheerio');
var golAirport = require('../util/airports/airports-data').getGolAirport;
var smilesAirport = require('../util/airports/airports-data').getSmilesAirport;
const Unicorn = require('../util/services/unicorn/unicorn');
const util = require('util');
var Confianca = require('../util/helpers/confianca-crawler');
var tough = require('tough-cookie');
var CookieJar = tough.CookieJar;
var cJar = undefined;

module.exports = {
    getFlightInfo: getFlightInfo,
    getTax: getTax
};

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
            infants: 0,
            confianca: req.query.confianca === 'true'
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

        Formatter.responseFormat(golResponse.redeemResponse, golResponse.moneyResponse, golResponse.confiancaResponse, params, 'gol').then(async function (formattedData) {
            if (formattedData.error) {
                exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                return;
            }

            if (!validator.isFlightAvailable(formattedData)) {
                exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                return;
            }

            var request = await db.saveRequest('gol', (new Date()).getTime() - startTime, params, null, 200, formattedData);
            await db.saveRequestResources(request._id, golResponse.redeemResponse.headers, golResponse.redeemResponse.cookieJar);
            res.status(200);
            res.json({results: formattedData, id: request._id});
        }, function (err) {
            throw err;
        });

    } catch (err) {
        exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, err.stack, 400, MESSAGES.CRITICAL, new Date());
    }
}

function makeRequests(params, startTime, res) {
    return Promise.all([getCashResponse(params, startTime, res), getRedeemResponse(params, startTime, res), getConfiancaResponse(params, startTime, res)]).then(function (results) {
        if (results[0].err) {
            exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, results[0].err, results[0].code, results[0].message, new Date());
            return null;
        }
        if (results[1].err) {
            exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, results[1].err, results[1].code, results[1].message, new Date());
            return null;
        }
        return {moneyResponse: results[0], redeemResponse: results[1], confiancaResponse: results[2]};
    });
}

function getCashResponse(params, startTime, res) {
    if(params.confianca === true) {
        return {
            TripResponses: []
        };
    }

    var request = Proxy.setupAndRotateRequestLib('request-promise', 'gol');
    var cookieJar = request.jar();

    var sessionUrl = 'https://wsvendasv2.voegol.com.br/Implementacao/ServiceLogon.svc/rest/Logon?language=pt-BR';
    var flightsUrl = 'https://wsvendasv2.voegol.com.br/Implementacao/ServicePurchase.svc/rest/GetAllFlights';

    return request.post({
        url: sessionUrl,
        jar: cookieJar,
        form: JSON.stringify({'Username': 'vendaAndroidApp', 'Password': 'vendaAndroidApp', 'Language': 'pt-BR'}),
        rejectUnauthorized: false
    }).then(function (body) {
        console.log('GOL:  ...made cash session request');
        var sessionId = body.replace(/^\"+|\"+$/g, '');
        var formData = {
            'CurrencyCode': 'BRL',
            'DepartureDate': [params.departureDate],
            'DepartureCode': params.originAirportCode,
            'DepartureCodeList': [params.originAirportCode],
            'ArrivalCode': params.destinationAirportCode,
            'ArrivalCodeList': [params.destinationAirportCode],
            'FromChangeProcess': false,
            'NumAdt': params.adults,
            'NumChd': params.children,
            'NumInf': 0,
            'Periodo': 0,
            'PromoCode': '',
            'sessionId': sessionId,
            'TypeJourney': params.returnDate ? 'ROUND_TRIP' : 'ONE_WAY'
        };

        if (params.returnDate) formData["DepartureDate"].push(params.returnDate);

        if (golAirport(params.originAirportCode) && golAirport(params.destinationAirportCode)) {
            return request.post({
                uri: flightsUrl,
                form: JSON.stringify(formData),
                jar: cookieJar,
                rejectUnauthorized: false
            }).then(function (body) {
                console.log('GOL:  ...got cash read');
                try {
                    var result = JSON.parse(body);
                } catch (err) {
                    return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
                }
                if (!result["TripResponses"]) {
                    return {err: "", code: 404, message: MESSAGES.NOT_FOUND};
                }
                return result;
            }).catch(function (err) {
                return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
            });
        }
        else
            return {"TripResponses": []};
    }).catch(function(err) {
        return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
    });
}

function getRedeemResponse(params, startTime, res) {
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'gol');
    const exifPromise = util.promisify(exif);

    var originAirport = smilesAirport(params.originAirportCode);
    var destinationAirport = smilesAirport(params.destinationAirportCode);

    if (!originAirport || !destinationAirport) {
        return {err: true, code: 404, message: MESSAGES.NO_AIRPORT};
    }

    var referer = Formatter.formatSmilesUrl(params);
    console.log(referer);
    var cookieJar = request.jar();

    return request.get({url: 'https://www.smiles.com.br/home', jar: cookieJar}).then(function () {
        return request.get({url: referer, headers: {"user-agent": "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36"}, jar: cookieJar}).then(async function (body) {
            console.log('... got html page');
            var $ = cheerio.load(body);
            var image = $('#customDynamicLoading').attr('src').split('base64,')[1];
            var buffer = Buffer.from(image, 'base64');
            var obj = await exifPromise(buffer);
            var strackId = Formatter.batos(obj.image.XPTitle) + Formatter.batos(obj.image.XPAuthor) +
                Formatter.batos(obj.image.XPSubject) + Formatter.batos(obj.image.XPComment);

            console.log('... got strack id: ' + strackId);

            var headers = {
                "user-agent": "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36",
                "x-api-key": Keys.golApiKey,
                "referer": referer,
                "x-strackid": strackId
            };

            var url = Formatter.formatSmilesFlightsApiUrl(params);

            return request.get({
                url: url,
                headers: headers,
                jar: cookieJar
            }).then(function (response) {
                console.log('... got redeem JSON');
                cJar = cookieJar;
                var result = JSON.parse(response);
                if ((originAirport["congenere"] && originAirport["country"] !== 'Brasil') ||
                    (destinationAirport["congenere"] && destinationAirport["country"] !== 'Brasil')) {
                    return request.get({
                        url: Formatter.formatSmilesFlightsApiUrl(params, true),
                        headers: headers,
                        jar: cookieJar
                    }).then(function (response) {
                        console.log('... got redeem JSON (congener)');
                        var congenerResult = JSON.parse(response);
                        for (let i = 0; i < congenerResult["requestedFlightSegmentList"].length; i++) {
                            congenerResult["requestedFlightSegmentList"][i]["flightList"] =
                                congenerResult["requestedFlightSegmentList"][i]["flightList"]
                                    .concat(result["requestedFlightSegmentList"][i]["flightList"])
                        }
                        congenerResult.cookieJar = cookieJar._jar.serializeSync();
                        congenerResult.headers = headers;
                        return congenerResult;
                    }).catch(function (err) {
                        return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
                    });
                } else {
                    console.log(result);
                    result.cookieJar = cookieJar._jar.serializeSync();
                    result.headers = headers;
                    return result;
                }
            }).catch(function (err) {
                return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
            });
        }).catch(function (err) {
            return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
        });
    }).catch (function (err) {
        return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
    });
}

function getTax(req, res, next) {
    Promise.all([makeTaxRequest(req.query.requestId, req.query.goingFlightId, req.query.goingFareId),
        makeTaxRequest(req.query.requestId, req.query.returningFlightId, req.query.returningFareId)]).then(function (results) {
        if (results[0].err) {
            res.status(500).json({err: results[0].message});
            return;
        }
        if (results[1].err) {
            res.status(500).json({err: results[1].message});
            return;
        }
        res.json({tax: results[0].tax + results[1].tax});
    }).catch(function (err) {
        res.status(500);
    });
}

async function makeTaxRequest(requestId, flightId, fareId) {
    if (!requestId || !flightId || !fareId) return {tax: 0};

    var request = Proxy.setupAndRotateRequestLib('request-promise', 'gol');

    try {
        var requestResources = await db.getRequestResources(requestId);
        if (!requestResources) {
            return {err: true, code: 404, message: MESSAGES.NOT_FOUND};
        }

        var jar = request.jar();
        jar._jar = CookieJar.deserializeSync(requestResources.cookieJar);
        var url = `https://flightavailability-prd.smiles.com.br/getboardingtax?adults=1&children=0&fareuid=${fareId}&infants=0&type=SEGMENT_1&uid=${flightId}`;
        return request.get({
            url: url,
            headers: requestResources.headers,
            jar: jar
        }).then(function (response) {
            var airportTaxes = JSON.parse(response);
            if (!airportTaxes) {
                return {err: true, code: 500, message: MESSAGES.UNREACHABLE};
            }
            console.log(`TAX GOL:   ...retrieved tax successfully`);
            return {tax: airportTaxes.totals.total.money};
        }).catch(function (err) {
            return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
        });
    } catch (err) {
        return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
    }
}

function getConfiancaResponse(params, startTime, res) {
    return Confianca(params);
}