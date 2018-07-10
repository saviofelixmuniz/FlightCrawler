/**
 * @author Sávio Muniz
 */
module.exports = getFlightInfo;
const db = require('../helpers/db-helper');
const Formatter = require('../helpers/format.helper');
const exception = require('../helpers/exception');
const MESSAGES = require('../helpers/messages');
const validator = require('../helpers/validator');
const Proxy = require ('../helpers/proxy');

var request = Proxy.setupAndRotateRequestLib('request', 'azul');
var cookieJar = request.jar();

async function getFlightInfo(req, res, next) {
    const START_TIME = (new Date()).getTime();
    cookieJar = request.jar();

    console.log('Searching Azul...');
    try {
        var searchUrl = 'https://viajemais.voeazul.com.br/Search.aspx';
        const MODE_PROP = 'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes';

        var params = {
            IP: req.clientIp,
            adults: req.query.adults,
            children: req.query.children ? req.query.children : '0',
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            international: req.query.international === 'true',
            forceCongener: false,
            infants: 0
        };

        var cached = await db.getCachedResponse(params, new Date(), 'azul');
        if (cached) {
            db.saveRequest('azul', (new Date()).getTime() - START_TIME, params, null, 200, null);
            res.status(200);
            res.json({results: cached});
            return;
        }

        var formData = Formatter.formatAzulForm(params, !params.returnDate);
        var azulResponse = {moneyResponse: null, redeemResponse: null};

        if (!formData || formData.hdfSearchCodeArrival1 !== '1N' || formData.hdfSearchCodeDeparture1 !== '1N') {
            exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, null, 404, MESSAGES.NO_AIRPORT, new Date());
            return;
        }
        
        makeRequests();

        function makeRequests() {
            var headers = Formatter.formatAzulHeaders(formData, 'post');
            formData[MODE_PROP] = 'R'; //retrieving money response

            request.post({url: searchUrl, form: formData, headers: headers, jar: cookieJar}, function (err, response) {
                console.log('AZUL:  ...got first money info');
                if (err) {
                    if (!response) {
                        exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
                        return;
                    }

                    exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 500, MESSAGES.UNREACHABLE, new Date());
                    return;
                }
                request.get({
                    url: 'https://viajemais.voeazul.com.br/Availability.aspx',
                    jar: cookieJar
                }, function (err, response, body) {
                    console.log('AZUL:  ...got second money info');
                    if (err) {
                        if (!response) {
                            exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
                            return;
                        }

                        exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 500, MESSAGES.UNREACHABLE, new Date());
                        return;
                    }

                    azulResponse.moneyResponse = body;

                    formData[MODE_PROP] = 'TD'; //retrieving redeem response

                    request.post({url: searchUrl, form: formData, jar: cookieJar}, function () {
                        console.log('AZUL:  ...got first redeem info');
                        request.get({
                            url: 'https://viajemais.voeazul.com.br/Availability.aspx',
                            jar: cookieJar
                        }, function (err, response, body) {
                            console.log('AZUL:  ...got second redeem info');
                            if (err) {
                                if (!response) {
                                    exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
                                    return;
                                }

                                exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 500, MESSAGES.UNREACHABLE, new Date());
                                return;
                            }

                            azulResponse.redeemResponse = body;

                            Formatter.responseFormat(azulResponse.redeemResponse, azulResponse.moneyResponse, params, 'azul', cookieJar).then(function (formattedData) {
                                if (formattedData.error) {
                                    exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                                    return;
                                }

                                if (!validator.isFlightAvailable(formattedData)) {
                                    exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                                    return;
                                }

                                res.status(200);
                                res.json({results: formattedData});
                                db.saveRequest('azul', (new Date()).getTime() - START_TIME, params, null, 200, formattedData);
                            });
                        });
                    });
                });
            });
        }

    } catch (err) {
        console.log(err);
        exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.CRITICAL, new Date())
    }
}

