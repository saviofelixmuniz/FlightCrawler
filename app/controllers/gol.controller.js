/**
 * @author Sávio Muniz
 */

const errorSolver = require("../util/helpers/error-solver");
const Formatter = require('../util/helpers/format.helper');
const validator = require('../util/helpers/validator');
const exception = require('../util/services/exception');
const MESSAGES = require('../util/helpers/messages');
const Proxy = require ('../util/services/proxy');
const Keys = require('../configs/keys');
const db = require('../util/services/db-helper');
const PreFlightServices = require('../util/services/preflight');
var exif = require('exif');
var cheerio = require('cheerio');
var golAirport = require('../util/airports/airports-data').getGolAirport;
var smilesAirport = require('../util/airports/airports-data').getSmilesAirport;
const util = require('util');
var tough = require('tough-cookie');
const request = require('request-promise');
var CookieJar = tough.CookieJar;

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
            client: req.clientName || "",
            api_key: req.headers['authorization'],
            adults: req.query.adults,
            children: req.query.children ? req.query.children : '0',
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate ? req.query.returnDate : null,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            forceCongener: 'false',
            executive: req.query.executive === 'true',
            originCountry: req.query.originCountry || 'BR',
            destinationCountry: req.query.destinationCountry || 'BR',
            infants: 0
        };

        if (await PreFlightServices(params, startTime, 'gol', res)) {
            return;
        }

        var golResponse = await makeRequests(params, startTime, res);
        if (!golResponse || !golResponse.redeemResponse || !golResponse.moneyResponse) return;

        Formatter.responseFormat(golResponse.redeemResponse, golResponse.moneyResponse, params, 'gol').then(async function (formattedData) {
            if (formattedData.error) {
                exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, formattedData.error, 500, MESSAGES.PARSE_ERROR, new Date());
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
        errorSolver.solveFlightInfoErrors('gol', err, res, startTime, params);
    }
}

function makeRequests(params, startTime, res) {
    return Promise.all([getCashResponse(params, startTime, res), getRedeemResponse(params, startTime, res)]).then(function (results) {
        if (results[0].err) {
            throw {err : true, code : results[0].code, message : results[0].message, stack : results[0].stack};
        }
        if (results[1].err) {
            throw {err : true, code : results[1].code, message : results[1].message, stack : results[1].stack};
        }
        return {moneyResponse: results[0], redeemResponse: results[1]};
    });
}

async function getCashResponse(params, startTime, res) {
    var session = Proxy.createSession('gol');

    var sessionUrl = 'https://wsvendasv2.voegol.com.br/Implementacao/ServiceLogon.svc/rest/Logon?language=pt-BR';
    var flightsUrl = 'https://wsvendasv2.voegol.com.br/Implementacao/ServicePurchase.svc/rest/GetAllFlights';

    try {
        let body = await Proxy.require({
            session: session,
            request: {
                url: sessionUrl,
                form: JSON.stringify({'Username': 'vendaAndroidApp', 'Password': 'vendaAndroidApp', 'Language': 'pt-BR'}),
                rejectUnauthorized: false
            }
        });

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
            body = await Proxy.require({
                session: session,
                request: {
                    url: flightsUrl,
                    form: JSON.stringify(formData),
                    rejectUnauthorized: false
                }
            });

            console.log('GOL:  ...got cash read');

            try {
                var result = JSON.parse(body);
            } catch (err) {
                return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
            }

            if (!result["TripResponses"]) {
                return {err: "", code: 404, message: MESSAGES.NOT_FOUND};
            }

            Proxy.killSession(session);
            return result;
        }
        else{
            Proxy.killSession(session);
            return {"TripResponses": []};
        }
    } catch (err) {
        Proxy.killSession(session);
        let err_status = errorSolver.getHttpStatusCodeFromMSG(err.message);
        let err_code = parseInt(err_status);
        return {err: true, code: err_code, message: err.message, stack : err.stack}
    }
}

async function getRedeemResponse(params) {
    const exifPromise = util.promisify(exif);
    const session = Proxy.createSession('gol');

    var originAirport = smilesAirport(params.originAirportCode);
    var destinationAirport = smilesAirport(params.destinationAirportCode);

    if (!originAirport || !destinationAirport) {
        return {err: true, code: 404, message: MESSAGES.NO_AIRPORT};
    }

    var referer = Formatter.formatSmilesUrl(params);

    try {
        await Proxy.require({session: session, request: {url: 'https://www.smiles.com.br/home'}});
        let body = await Proxy.require({
            session: session,
            request: {
                url: referer
            }
        });

        console.log('GOL:...got html page');
        var $ = cheerio.load(body);
        var image = $('#customDynamicLoading').attr('src').split('base64,')[1];
        var buffer = Buffer.from(image, 'base64');
        var obj = await exifPromise(buffer);
        var strackId = Formatter.batos(obj.image.XPTitle) + Formatter.batos(obj.image.XPAuthor) +
            Formatter.batos(obj.image.XPSubject) + Formatter.batos(obj.image.XPComment);

        console.log('GOL:...got strack id: ' + strackId);

        var headers = {
            "x-api-key": Keys.golApiKey,
            "referer": referer,
            "x-strackid": strackId
        };

        var url = Formatter.formatSmilesFlightsApiUrl(params);

        let response = await Proxy.require({
            session: session,
            request: {
                url: url,
                headers: headers
            }
        });

        console.log('GOL:...got redeem JSON');
        var result = JSON.parse(response);

        if ((originAirport["congenere"] && originAirport["country"] !== 'Brasil') ||
            (destinationAirport["congenere"] && destinationAirport["country"] !== 'Brasil')) {

            response = await Proxy.require({
                session: session,
                request: {
                    url: Formatter.formatSmilesFlightsApiUrl(params, true),
                    headers: headers
                }
            });

            console.log("GOL:...got congener response");
            var congenerResult = JSON.parse(response);
            for (let i = 0; i < congenerResult["requestedFlightSegmentList"].length; i++) {
                congenerResult["requestedFlightSegmentList"][i]["flightList"] =
                    congenerResult["requestedFlightSegmentList"][i]["flightList"]
                        .concat(result["requestedFlightSegmentList"][i]["flightList"])
            }

            result = congenerResult;
        }
        result.cookieJar = Proxy.getSessionJar(session)._jar.serializeSync();
        result.headers = headers;
        result.headers["user-agent"] = Proxy.getSessionAgent(session);
        Proxy.killSession(session);
        return result;
    } catch (err) {
        Proxy.killSession(session);
        if (err.message) {
            let err_status = errorSolver.getHttpStatusCodeFromMSG(err.message);
            let err_code = parseInt(err_status);
        }
        return {err: true, code: err_code || 500, message: err.message, stack : err.stack}
    }
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
        res.status(500).json({err: err.stack});
    });
}

async function makeTaxRequest(requestId, flightId, fareId) {
    if (!requestId || !flightId || !fareId) return {tax: 0};

    var session = Proxy.createSession('gol',true);

    try {
        var requestResources = await db.getRequestResources(requestId);
        if (!requestResources) {
            return {err: true, code: 404, message: MESSAGES.NOT_FOUND};
        }

        var jar = request.jar();
        jar._jar = CookieJar.deserializeSync(requestResources.cookieJar);
        var url = `https://flightavailability-prd.smiles.com.br/getboardingtax?adults=1&children=0&fareuid=${fareId}&infants=0&type=SEGMENT_1&uid=${flightId}`;
        let response = await Proxy.require({
            session: session,
            request: {
                url: url,
                headers: requestResources.headers,
                jar: jar
            }
        });

        var airportTaxes = JSON.parse(response);

        if (!airportTaxes) {
            return {err: true, code: 500, message: MESSAGES.UNREACHABLE};
        }

        Proxy.killSession(session);
        console.log(`TAX GOL:   ...retrieved tax successfully`);
        return {tax: airportTaxes.totals.total.money};
    } catch (err) {
        Proxy.killSession(session);
        return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
    }
}