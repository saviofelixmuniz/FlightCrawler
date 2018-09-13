/**
 * @author Sávio Muniz
 */

const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
var Parser = require('../util/helpers/parse-utils');
const exception = require('../util/services/exception');
const validator = require('../util/helpers/validator');
const MESSAGES = require('../util/helpers/messages');
const Proxy = require ('../util/services/proxy');
const CONSTANTS = require ('../util/helpers/constants');
const PreFlightServices = require('../util/services/preflight');
var Confianca = require('../util/helpers/confianca-crawler');

module.exports = {getFlightInfo: getFlightInfo, getTax: getTax};

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
            executive: req.query.executive === 'true',
            confianca: false
        };

        if (await PreFlightServices(params, START_TIME, 'avianca', res)) {
            return;
        }

        var aviancaResponse = await makeRequests(params, START_TIME, res);
        if (!aviancaResponse || !aviancaResponse.amigoResponse || !aviancaResponse.jsonResponse) return;

        if (isAmigoResponseInvalid(aviancaResponse.amigoResponse)) {
            exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
            return;
        }

        Formatter.responseFormat(aviancaResponse.amigoResponse, aviancaResponse.jsonResponse, aviancaResponse.confiancaResponse, params, 'avianca').then(async function (formattedResponse) {
            if (formattedResponse.error) {
                exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, formattedResponse.error, 500, MESSAGES.PARSE_ERROR, new Date());
                return;
            }

            if (!validator.isFlightAvailable(formattedResponse)) {
                exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                return;
            }

            var taxes = formattedResponse.taxes;
            delete formattedResponse.taxes;
            var request = await db.saveRequest('avianca', (new Date()).getTime() - START_TIME, params, null, 200, formattedResponse);
            await db.saveRequestResources(request._id, null, null, taxes);
            res.status(200);
            res.json({results: formattedResponse, id: request._id});
        });


    } catch (err) {
        if (err.err) {
            if (err.code === 407) {
                exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err.stack, 504, MESSAGES.PROXY_ERROR, new Date());
            } else {
                exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err.stack, err.code, err.message, new Date());
            }
        } else {
            exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err.stack, 500, MESSAGES.CRITICAL, new Date());
        }
    }
}

function makeRequests(params, startTime, res) {
    return Promise.all([getJsonResponse(params, startTime, res), getAmigoResponse(params, startTime, res), getConfiancaResponse(params, startTime, res)]).then(function (results) {
        if (results[0].err) {
            throw {err : true, code : results[0].code, message : results[0].message, stack : results[0].stack};
            //exception.handle(res, 'avianca', (new Date()).getTime() - startTime, params, results[0].err, results[0].code, results[0].message, new Date());
            //return null;
        }
        if (results[1].err) {
            throw {err : true, code : results[0].code, message : results[0].message, stack : results[0].stack};
            //exception.handle(res, 'avianca', (new Date()).getTime() - startTime, params, results[1].err, results[1].code, results[1].message, new Date());
            //return null;
        }
        return {jsonResponse: results[0], amigoResponse: results[1], confiancaResponse: results[2]};
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
                for (var p of payload) {
                    if (p.originAirport.iataCode === params.originAirportCode &&
                        p.destinationAirport.iataCode === params.destinationAirportCode) {
                        cabins = p.cabins;
                        break;
                    }
                }
            }

            if (!cabins) {
                return {err: true, code: 404, message: MESSAGES.UNAVAILABLE};
            }

            var hasExecutiveCabin = false;
            var hasAwardCabin = false;
            for (var cabin of cabins) {
                if (cabin.type === 'Award') {
                    hasAwardCabin = true;
                }
                if (cabin.type === 'Executive') {
                    hasExecutiveCabin = true;
                }
            }

            if (!hasAwardCabin || (params.executive && !hasExecutiveCabin)) {
                return {err: true, code: 404, message: MESSAGES.UNAVAILABLE};
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
                var mainUrl = undefined;
                if (parsedBody.payload) {
                    mainUrl = parsedBody.payload.url;
                }
                else {
                    return {err: "AviancaController: (undefined body)", code: 500, message: MESSAGES.UNREACHABLE};
                }

                return request.post({url: mainUrl, jar: cookieJar}).then(function (body) {
                    console.log('AVIANCA:  ...got api response');
                    try {
                        return Formatter.parseAviancaResponse(body);
                    } catch (err) {
                        return {err: err.stack, code: 500, message: MESSAGES.CRITICAL};
                    }
                }).catch(function (err) {
                    return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
                });
            }).catch(function (err) {
                return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
            });
        }).catch(function (err) {
            return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
        });
    }).catch(function (err) {
        let err_status = getHttpStatusCodeFromMSG(err.message);
        let err_code = parseInt(err_status);
        return {err: true, code: err_code, message: err.message, stack : err.stack}
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
                    return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
                });
            }).catch(function (err) {
                return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
            });
        }).catch(function (err) {
            return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
        });
    }).catch(function (err) {
        let err_status = getHttpStatusCodeFromMSG(err.message);
        let err_code = parseInt(err_status);
        return {err: true, code: err_code, message: err.message, stack : err.stack}
    });
}

async function getTax(req, res, next) {
    try {
        var requestResources = await db.getRequestResources(req.query.requestId);
        if (!requestResources) {
            res.status(500);
            return;
        }
        var id = (req.query.goingFareId && req.query.returningFareId) ? req.query.goingFareId + '_' + req.query.returningFareId :
            (req.query.goingFareId ? req.query.goingFareId : req.query.returningFareId);
        res.json({tax: requestResources.resources[id].tax});
    } catch (err) {
        res.status(500).json({error : err.stack});
        return;
    }
}

function getConfiancaResponse(params, startTime, res) {
    return Confianca(params);
}

function formatDate(date) {
    var splitDate = date.split('-');
    return splitDate[0] + splitDate[1] + splitDate[2];
}

function isAmigoResponseInvalid(response) {
    return response.indexOf('var generatedJSon') === -1;
}

function getHttpStatusCodeFromMSG(msg) {
    return msg.match(/\s*(?:statuscode|status|code|httpstatus)\s*=\s*\d\d\d/i).toString().match(/\d+/).toString();
}