/**
 * @author Sávio Muniz
 */

const errorSolver = require("../util/helpers/error-solver");
const Formatter = require('../util/helpers/format.helper');
const validator = require('../util/helpers/validator');
const exception = require('../util/services/exception');
const MESSAGES = require('../util/helpers/messages');
const Requester = require ('../util/services/requester');
const Keys = require('../configs/keys');
const db = require('../util/services/db-helper');
const PreFlightServices = require('../util/services/preflight');
var exif = require('exif');
var cheerio = require('cheerio');
var golAirport = require('../util/airports/airports-data').getGolAirport;
var smilesAirport = require('../util/airports/airports-data').getSmilesAirport;
const util = require('util');
var tough = require('tough-cookie');
const Request = require('request-promise');
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
    var session = Requester.createSession('gol');

    var sessionUrl = 'https://wsvendasv2.voegol.com.br/Implementacao/ServiceLogon.svc/rest/Logon?language=pt-BR';
    var flightsUrl = 'https://wsvendasv2.voegol.com.br/Implementacao/ServicePurchase.svc/rest/GetAllFlights';

    try {
        let body = await Requester.require({
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
            body = await Requester.require({
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

            Requester.killSession(session);
            return result;
        }
        else{
            Requester.killSession(session);
            return {"TripResponses": []};
        }
    } catch (err) {
        Requester.killSession(session);
        let err_status = errorSolver.getHttpStatusCodeFromMSG(err.message);
        let err_code = parseInt(err_status);
        return {err: true, code: err_code, message: err.message, stack : err.stack}
    }
}

async function getRedeemResponse(params) {
    const exifPromise = util.promisify(exif);
    const session = Requester.createSession('gol');

    var originAirport = smilesAirport(params.originAirportCode);
    var destinationAirport = smilesAirport(params.destinationAirportCode);

    if (!originAirport || !destinationAirport) {
        return {err: true, code: 404, message: MESSAGES.NO_AIRPORT};
    }

    var referer = Formatter.formatSmilesUrl(params);

    try {
        await Requester.require({session: session, request: {url: 'https://www.smiles.com.br/home'}});
        let body = await Requester.require({
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

        let response = await Requester.require({
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

            response = await Requester.require({
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
        result.cookieJar = Requester.getSessionJar(session)._jar.serializeSync();
        result.headers = headers;
        result.headers["user-agent"] = Requester.getSessionAgent(session);
        Requester.killSession(session);
        return result;
    } catch (err) {
        Requester.killSession(session);
        let err_code;
        if (err.message) {
            let err_status = errorSolver.getHttpStatusCodeFromMSG(err.message);
            err_code = parseInt(err_status);
        }
        return {err: true, code: err_code || 500, message: err.message, stack : err.stack}
    }
}

async function findFlightTax(stretches, flightId, flightId2, searchId, goingAirport, returningAirport) {
    if (!flightId)
        return 0;

    for (let stretch in stretches) {
        for (let flight of stretches[stretch]["Voos"]) {
            if (flight.id === flightId) {
                if (flight["Milhas"][0]["TaxaEmbarque"]) {
                    return flight["Milhas"][0]["TaxaEmbarque"];
                } else {
                    var session = Requester.createSession('unicorn', true);

                    var totalTax = 0;

                    if (flightId && flightId2 && returningAirport === 'MVD') {
                        var url = `https://bff-site.maxmilhas.com.br/search/${searchId}?airline=gol&flightId=`;
                        url += flightId ? flightId : flightId2;

                        var body = await Requester.require({
                            session: session,
                            request: {
                                url: url
                            }
                        });

                        totalTax += 223.8;
                    } else {
                        var url = `https://bff-site.maxmilhas.com.br/search/${searchId}?airline=gol&flightId=`;
                        url += flightId ? flightId : flightId2;
                        if (flightId && flightId2) url += `&flightId=${flightId2}`;

                        var body = await Requester.require({
                            session: session,
                            request: {
                                url: url
                            }
                        });
                    }

                    Requester.killSession(session);
                    try {
                        var response = JSON.parse(body);
                        var feesAdded = {};
                        for (let flight of response.flights) {
                            feesAdded = {};
                            for (let fee of flight.pricing.miles.adult.fees) {
                                if (feesAdded[fee.type]) continue;
                                else {
                                    feesAdded[fee.type] = true;
                                    if (fee.type !== 'SERVICE_FEE')
                                        totalTax += fee.value;
                                }
                            }
                            for (let fee of flight.pricing.airline.adult.fees) {
                                if (feesAdded[fee.type]) continue;
                                else {
                                    feesAdded[fee.type] = true;
                                    if (fee.type !== 'SERVICE_FEE')
                                        totalTax += fee.value;
                                }
                            }
                        }

                        return totalTax;
                    } catch (e) {
                        return 0;
                    }
                }
            }
        }
    }

    return 0;
}

async function getTax(req, res) {
    try {
        if (!req.query.requestId)
            throw new Error("No request id");

        if (!req.query.goingFareId && !req.query.returningFareId ||
             req.query.goingFareId === "null" && req.query.returningFareId === "null" ||
            !req.query.goingFareId && req.query.returningFareId === "null" ||
            req.query.goingFareId === "null" && !req.query.returningFareId) {
            var request = await db.getRequest(req.query.requestId);
            if (!request)
                throw new Error("Request not found");

            var tax = 0;
            if (req.query.goingFlightId && !req.query.returningFlightId)
                tax = await findFlightTax(request["response"]["Trechos"], req.query.goingFlightId, null, request["response"]["unicornId"],
                    req.query.originAirportCode, req.query.destinationAirportCode);
            else if (req.query.returningFlightId && !req.query.goingFlightId)
                tax = await findFlightTax(request["response"]["Trechos"], null, req.query.returningFlightId, request["response"]["unicornId"],
                    req.query.originAirportCode, req.query.destinationAirportCode);
            else {
                tax = await findFlightTax(request["response"]["Trechos"], req.query.goingFlightId, req.query.returningFlightId, request["response"]["unicornId"],
                    req.query.originAirportCode, req.query.destinationAirportCode);
            }

            if (!tax)
                throw new Error("Invalid boarding tax");

            return res.json({tax: tax});
        }

        makeTaxRequest(req.query.requestId, req.query.goingFlightId, req.query.goingFareId, req.query.returningFlightId,
            req.query.returningFareId, req.query.originAirportCode, req.query.destinationAirportCode).then(function (result) {
            if (result.err) {
                res.status(result.code).json({err: result.message});
                return;
            }

            res.json({tax: result.tax});
        }).catch(function (err) {
            res.status(500).json({err: err.stack});
        });
    } catch (e) {
        res.status(500).json({err: e.stack});
    }
}

async function makeTaxRequest(requestId, flightId, fareId, flightId2, fareId2, airportCode, airport2Code) {
    if (!requestId || ((!flightId || !fareId) && (!flightId2 || !fareId2))) return {err: true, code: 400, message: 'Missing params.'};

    var session = Requester.createSession('gol',true);

    try {
        var requestResources = await db.getRequestResources(requestId);
        var request = await db.getRequest(requestId);
        if (!requestResources || !request) {
            return {err: true, code: 404, message: MESSAGES.NOT_FOUND};
        }

        // check cache if origin and destination are BR
        if (request.params.originCountry === 'BR' && request.params.destinationCountry === 'BR') {
            var cachedGoingAirport = null;
            var cachedReturningAirport = null;
            var cachedGoingTax = 0;
            var cachedReturningTax = 0;

            if (fareId && airportCode) {
                cachedGoingAirport = await db.getAirport(airportCode, 'gol');
                cachedGoingTax = getCachedAirportTax(cachedGoingAirport);
            }
            if (fareId2 && airport2Code) {
                cachedReturningAirport = await db.getAirport(airport2Code, 'gol');
                cachedReturningTax = getCachedAirportTax(cachedReturningAirport);
            }
        }

        if (cachedGoingTax && cachedReturningTax) {
            console.log('Gol cached tax: ' + (cachedGoingTax + cachedReturningTax));
            return {tax: cachedGoingTax + cachedReturningTax};
        } else if (cachedGoingTax && !fareId2) {
            console.log('Gol cached tax: ' + (cachedGoingTax));
            return {tax: cachedGoingTax};
        } else if (cachedReturningTax && !fareId) {
            console.log('Gol cached tax: ' + (cachedReturningTax));
            return {tax: cachedReturningTax};
        }

        var jar = Request.jar();
        jar._jar = CookieJar.deserializeSync(requestResources.cookieJar);

        var url = `https://flightavailability-prd.smiles.com.br/getboardingtax?adults=1&children=0&fareuid=${fareId ? fareId : fareId2}&infants=0&type=SEGMENT_1&uid=${flightId ? flightId : flightId2}`;
        if (flightId2 && fareId2 && flightId && fareId)
            url += `&type2=SEGMENT_2&fareuid2=${fareId2}&uid2=${flightId2}`;

        let response = await Requester.require({
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

        if (fareId && !fareId2 && airportCode) {
            await db.saveAirport(airportCode, airportTaxes.totals.total.money, 'gol');
        }
        else if (!fareId && fareId2 && airport2Code) {
            await db.saveAirport(airport2Code, airportTaxes.totals.total.money, 'gol');
        }

        Requester.killSession(session);
        console.log(`TAX GOL:   ...retrieved tax successfully`);
        return {tax: airportTaxes.totals.total.money};
    } catch (err) {
        Requester.killSession(session);
        return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
    }
}

// returns the tax if it is cached
function getCachedAirportTax(airport) {
    if (!airport) return 0;

    var dayBefore = new Date();
    dayBefore.setDate(dayBefore.getDate() - 1);

    if (airport.updated_at >= dayBefore) {
        return airport.tax;
    }

    return 0;
}