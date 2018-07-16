/**
 * @author Sávio Muniz
 */

const db = require('../helpers/db-helper');
const CONSTANTS = require('../helpers/constants');
const Formatter = require('../helpers/format.helper');
const exception = require('../helpers/exception');
const validator = require('../helpers/validator');
const MESSAGES = require('../helpers/messages');
const Proxy = require ('../helpers/proxy');

var request = Proxy.setupAndRotateRequestLib('request', 'avianca');
var cookieJar = request.jar();

module.exports = getFlightInfo;

async function getFlightInfo(req, res, next) {
    const START_TIME = (new Date()).getTime();

    console.log('Searching Avianca...');
    try {
        var params = {
            IP: req.clientIp,
            api_key: req.headers['authorization'],
            adults: req.query.adults,
            children: req.query.children,
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            originCountry: req.query.originCountry || 'BR',
            destinationCountry: req.query.destinationCountry || 'BR',
            forceCongener: false,
            infants: 0,
            executive: req.query.executive === 'true'
        };

        var cached = await db.getCachedResponse(params, new Date(), 'avianca');
        if (cached) {
            db.saveRequest('avianca', (new Date()).getTime() - START_TIME, params, null, 200, null);
            res.status(200);
            res.json({results: cached});
            return;
        }

        var tokenUrl = 'https://www.pontosamigo.com.br/api/jsonws/aviancaservice.tokenasl/get-application-token';
        request.get({url: tokenUrl, jar: cookieJar}, function (err, response) {
            if (err) {
                if (!response) {
                    exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
                    return;
                }

                exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err, 500, MESSAGES.UNREACHABLE, new Date());
                return;
            }
            console.log('AVIANCA:  ...got app token');
            var token = JSON.parse(response.body).accessToken;
            var availableCabinsUrl = `https://api.avianca.com.br/farecommercialization/routebasic/destinIataCode/${params.destinationAirportCode}/origIataCode/${params.originAirportCode}?access_token=${token}&locale=pt_BR`
            request.get({url: availableCabinsUrl, jar: cookieJar}, function (err, response) {
                if (err) {
                    if (!response) {
                        exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
                        return;
                    }

                    exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err, 500, MESSAGES.UNREACHABLE, new Date());
                    return;
                }
                console.log('AVIANCA:  ...got api first info');

                var payload = JSON.parse(response.body).payload;
                var cabins;
                if (payload && payload.length > 0) {
                    for (let p of payload) {
                        if (p.originAirport.iataCode === params.originAirportCode &&
                            p.destinationAirport.iataCode === params.destinationAirportCode) {
                            cabins = p.cabins;
                            break;
                        }
                    }
                }

                if (!cabins) {
                    exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err, 404, MESSAGES.UNAVAILABLE, new Date());
                    return;
                }

                var hasExecutiveCabin = false;
                var hasAwardCabin = false;
                for (let cabin of cabins) {
                    if (cabin.type === 'Award') {
                        hasAwardCabin = true;
                    }
                    if (cabin.type === 'Executive') {
                        hasExecutiveCabin = true;
                    }
                }

                if (!hasAwardCabin || (params.executive && !hasExecutiveCabin)) {
                    exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err, 404, MESSAGES.UNAVAILABLE, new Date());
                    return;
                }

                var tripFlowUrl = 'https://api.avianca.com.br/farecommercialization/generateurl/' +
                    `ORG=${params.originAirportCode}&DST=${params.destinationAirportCode}` +
                    `&OUT_DATE=${formatDate(params.departureDate)}&LANG=BR` + (params.returnDate ? `&IN_DATE=${formatDate(params.returnDate)}` : '') +
                    `&COUNTRY=BR&QT_ADT=${params.adults}&QT_CHD=${params.children}&QT_INF=0&FLX_DATES=true` +
                    `&CABIN=${params.executive ? 'Executive' : 'Economy'}` +
                    `&SOURCE=DESKTOP_REVENUE&MILES_MODE=TRUE?access_token=${token}`;

                request.get({url: tripFlowUrl, jar: cookieJar}, function (err, response) {
                    if (err) {
                        if (!response) {
                            exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
                            return;
                        }

                        exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err, 500, MESSAGES.UNREACHABLE, new Date());
                        return;
                    }
                    console.log('AVIANCA:  ...got api url response');

                    var parsedBody =JSON.parse(response.body);
                    if (parsedBody.payload) {
                        var mainUrl = parsedBody.payload.url;
                    }
                    else {
                        exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, "AviancaController: line 122 (undefined body)", 500, MESSAGES.UNREACHABLE, new Date());
                        return;
                    }

                    debugger;

                    request.post({url: mainUrl, jar: cookieJar}, function (err, response, body) {
                        console.log('AVIANCA:  ...got api response');
                        try {
                            var parsed = Formatter.parseAviancaResponse(body);
                        } catch (e) {
                            throw e;
                        }

                        Formatter.responseFormat(parsed, null, params, 'avianca').then(function (formattedResponse) {
                            if (formattedResponse.error) {
                                exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, formattedResponse.error, 400, MESSAGES.PARSE_ERROR, new Date());
                                return;
                            }

                            if (!validator.isFlightAvailable(formattedResponse)) {
                                exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                                return;
                            }

                            res.json({results: formattedResponse});
                            db.saveRequest('avianca', (new Date()).getTime() - START_TIME, params, null, 200, formattedResponse);
                        });

                    });
                });
            });
        });
    } catch (e) {
        exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.CRITICAL, new Date());
    }
}

function formatDate(date) {
    var splitDate = date.split('-');
    return splitDate[0] + splitDate[1] + splitDate[2];
}