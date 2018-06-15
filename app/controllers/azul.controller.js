/**
 * @author Sávio Muniz
 */
module.exports = getFlightInfo;
const db = require('../helpers/db-helper');
const Formatter = require('../helpers/format.helper');
const CONSTANTS = require('../helpers/constants');
const exception = require('../helpers/exception');
const MESSAGES = require('../helpers/messages');
const validator = require('../helpers/validator');
const Proxy = require ('../helpers/proxy');
const Auth = require('../helpers/api-auth');

var request = Proxy.setupAndRotateRequestLib('request');
var cookieJar = request.jar();

async function getFlightInfo(req, res, next) {
    const START_TIME = (new Date()).getTime();

    request = Proxy.setupAndRotateRequestLib('request');
    cookieJar = request.jar();

    try {
        var searchUrl = 'https://viajemais.voeazul.com.br/Search.aspx';
        var stationSearchUrl = 'https://interline.voeazul.com.br/Sell/RetonaListStationsFiltrada';
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

        var formData = Formatter.formatAzulForm(params, !params.returnDate);

        var azulResponse = {moneyResponse: null, redeemResponse: null};

        if (params.international) {
            request.post({
                url: stationSearchUrl,
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({txtDigitado: params.destinationAirportCode})
            }, function (err, response) {
                if (err) {
                    res.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 500, MESSAGES.UNREACHABLE, new Date());
                    return;
                }

                var result = JSON.parse(response.body);
                stations:
                    for (let station of result.stations) {
                        for (let stationFilha of station.stationsFilhas) {
                            for (let bean of stationFilha.stationBean) {
                                if (bean.code == params.destinationAirportCode) {
                                    if (bean.searchCode == '1A') {
                                        res.status(404);
                                        res.json('');
                                        db.saveRequest('azul', (new Date()).getTime() - START_TIME, params, null, 404, new Date());
                                        return;
                                    }
                                    break stations;
                                }
                            }
                        }
                    }

                makeRequests()
            });
        } else {
            makeRequests();
        }

        function makeRequests() {
            request.get({url: 'https://api.ipify.org?format=json'}, function (err, response, body) {
                console.log(body);
            });

            formData[MODE_PROP] = 'R'; //retrieving money response

            request.post({url: searchUrl, form: formData, jar: cookieJar}, function (err, response) {
                console.log('...got first money info');
                if (err) {
                    if (!response) {
                        exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
                    }

                    exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 500, MESSAGES.UNREACHABLE, new Date());
                    return;
                }
                request.get({
                    url: 'https://viajemais.voeazul.com.br/Availability.aspx',
                    jar: cookieJar
                }, function (err, response, body) {
                    console.log('...got second money info');
                    if (err) {
                        if (!response) {
                            exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
                        }

                        exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 500, MESSAGES.UNREACHABLE, new Date());
                        return;
                    }

                    azulResponse.moneyResponse = body;

                    formData[MODE_PROP] = 'TD'; //retrieving redeem response

                    request.post({url: searchUrl, form: formData, jar: cookieJar}, function () {
                        console.log('...got first redeem info');
                        request.get({
                            url: 'https://viajemais.voeazul.com.br/Availability.aspx',
                            jar: cookieJar
                        }, function (err, response, body) {
                            console.log('...got second redeem info');
                            if (err) {
                                if (!response) {
                                    exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
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


                                //success

                                res.status(200);
                                res.json({results: formattedData});
                                db.saveRequest('azul', (new Date()).getTime() - START_TIME, params, null, 200, new Date());
                            });


                            // var formattedData = Formatter.responseFormat(azulResponse.redeemResponse, azulResponse.moneyResponse, params, 'azul');
                            // // var data = {
                            // //     formattedData : formattedData,
                            // //     tamCashData : ''
                            // // };
                            // res.json(formattedData);
                        });
                    });
                });
            });
        }

    } catch (err) {
        exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.CRITICAL, new Date())
    }
}

