/**
 * @author Sávio Muniz
 */

const db = require('../helpers/db-helper');
const Formatter = require('../helpers/format.helper');
const exception = require('../helpers/exception');
const validator = require('../helpers/validator');
const MESSAGES = require('../helpers/messages');
const Proxy = require ('../helpers/proxy');
const CONSTANTS = require ('../helpers/constants');

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

        /*var cached = await db.getCachedResponse(params, new Date(), 'avianca');
        if (cached) {
            db.saveRequest('avianca', (new Date()).getTime() - START_TIME, params, null, 200, null);
            res.status(200);
            res.json({results: cached});
            return;
        }*/

        var aviancaResponse = await makeRequests(params, START_TIME, res);
        if (!aviancaResponse || !aviancaResponse.amigoResponse || !aviancaResponse.jsonResponse) return;

        Formatter.responseFormat(aviancaResponse.amigoResponse, aviancaResponse.jsonResponse, params, 'avianca').then(function (formattedResponse) {
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


    } catch (err) {
        exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.CRITICAL, new Date());
    }
}

function makeRequests(params, startTime, res) {
    return Promise.all([getJsonResponse(params, startTime, res), getAmigoResponse(params, startTime, res)]).then(function (results) {
        return {jsonResponse: results[0], amigoResponse: results[1]};
    });
}

function getJsonResponse(params, startTime, res) {
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'avianca');
    var tokenUrl = 'https://www.pontosamigo.com.br/api/jsonws/aviancaservice.tokenasl/get-application-token';
    var cookieJar = request.jar();
    return request.get({url: tokenUrl, jar: cookieJar}).then(function (body) {
        console.log('AVIANCA:  ...got app token');
        var token = JSON.parse(body).accessToken;
        var availableCabinsUrl = `https://api.avianca.com.br/farecommercialization/routebasic/destinIataCode/${params.destinationAirportCode}/origIataCode/${params.originAirportCode}?access_token=${token}&locale=pt_BR`
        return request.get({url: availableCabinsUrl, jar: cookieJar}).then(function (body) {
            console.log('AVIANCA:  ...got api first info');

            var payload = JSON.parse(body).payload;
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
                exception.handle(res, 'avianca', (new Date()).getTime() - startTime, params, null, 404, MESSAGES.UNAVAILABLE, new Date());
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
                exception.handle(res, 'avianca', (new Date()).getTime() - startTime, params, null, 404, MESSAGES.UNAVAILABLE, new Date());
                return;
            }

            var tripFlowUrl = 'https://api.avianca.com.br/farecommercialization/generateurl/' +
                `ORG=${params.originAirportCode}&DST=${params.destinationAirportCode}` +
                `&OUT_DATE=${formatDate(params.departureDate)}&LANG=BR` + (params.returnDate ? `&IN_DATE=${formatDate(params.returnDate)}` : '') +
                `&COUNTRY=BR&QT_ADT=${params.adults}&QT_CHD=${params.children}&QT_INF=0&FLX_DATES=true` +
                `&CABIN=${params.executive ? 'Executive' : 'Economy'}` +
                `&SOURCE=DESKTOP_REVENUE&MILES_MODE=TRUE?access_token=${token}`;

            return request.get({url: tripFlowUrl, jar: cookieJar}).then(function (body) {
                console.log('AVIANCA:  ...got api url response');

                var parsedBody =JSON.parse(body);
                if (parsedBody.payload) {
                    var mainUrl = parsedBody.payload.url;
                }
                else {
                    exception.handle(res, 'avianca', (new Date()).getTime() - startTime, params, "AviancaController: (undefined body)", 500, MESSAGES.UNREACHABLE, new Date());
                    return;
                }

                return request.post({url: mainUrl, jar: cookieJar}).then(function (body) {
                    console.log('AVIANCA:  ...got api response');
                    try {
                        return Formatter.parseAviancaResponse(body);
                    } catch (err) {
                        exception.handle(res, 'avianca', (new Date()).getTime() - startTime, params, err, 400, MESSAGES.CRITICAL, new Date());
                    }
                }).catch(function (err) {
                    exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
                });
            }).catch(function (err) {
                exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
            });
        }).catch(function (err) {
            exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
        });
    }).catch(function (err) {
        exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
    });
}

function getAmigoResponse(params, startTime, res) {
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'avianca');
    return request.post({url: 'https://www.avianca.com.br/api/jsonws/aviancaservice.tokenasl/get-customer-token',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        form: {
            'clientUsername': '',
            'documentNumber': '74221172657',
            'flyerId': '',
            'clientPassword': 'Peidei2@18',
            'userType': 'customer'
        }}).then(function (body) {
        console.log('...Programa amigo: first');
        var token = JSON.parse(body);
        console.log('...Programa amigo: second');
        var loginForm = CONSTANTS.AVIANCA_LOGIN_FORM;
        var jar = request.jar();
        return request.post({
            url: 'https://www.avianca.com.br/login-avianca?p_p_id=com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB&p_p_lifecycle=1&p_p_state=normal&p_p_mode=view&p_p_col_id=column-1&p_p_col_pos=2&p_p_col_count=4&_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_javax.portlet.action=doLogin&p_auth=8lIHnGml',
            form: loginForm,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            jar: jar
        }).then(function (body) {
            console.log('...Programa amigo: third');
            var tripFlowUrl = 'https://api.avianca.com.br/farecommercialization/generateurl/' +
                `ORG=${params.originAirportCode}&DST=${params.destinationAirportCode}` +
                `&OUT_DATE=${formatDate(params.departureDate)}&LANG=BR` + (params.returnDate ? `&IN_DATE=${formatDate(params.returnDate)}` : '') +
                `&COUNTRY=BR&QT_ADT=${params.adults}&QT_CHD=${params.children}&QT_INF=0&FLX_DATES=true` +
                `&CABIN=Award` +
                `&SOURCE=DESKTOP_REDEMPTION?access_token=${token.accessToken}`;
            return request.get({url: tripFlowUrl}).then(function (body) {
                var url = body;
                console.log('...Programa amigo: fourth');
                return request.get({url: JSON.parse(url).payload.url}).then(function (body) {
                    console.log('...Programa amigo: fifth');
                    return body;
                }).catch(function (err) {
                    exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
                });
            }).catch(function (err) {
                exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
            });
        }).catch(function (err) {
            exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
        });
    }).catch(function (err) {
        exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
    });
}

function formatDate(date) {
    var splitDate = date.split('-');
    return splitDate[0] + splitDate[1] + splitDate[2];
}