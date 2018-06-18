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
const rp = Proxy.setupAndRotateRequestLib('requestretry');
const axios = require('axios');

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

            var headers = {'Origin': 'https', 'Content-Length': '1575', 'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7', 'Accept-Encoding': 'gzip, deflate, br', 'Host': 'viajemais.voeazul.com.br', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8', 'Upgrade-Insecure-Requests': '1', 'Content-Type': 'application/x-www-form-urlencoded'};
            var coisa = {'ControlGroupSearch$SearchMainSearchView$TextBoxPromoCode': 'CALLCENT', 'culture': 'pt-BR', 'ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay1': '15', 'departure1': '15/08/2018', 'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacDestination1': '', 'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT': '0', 'originIata1': 'SAO', 'origin1': 'S\xc3\xa3o Paulo - Todos os Aeroportos (SAO)', 'ControlGroupSearch$SearchMainSearchView$TextBoxMarketOrigin1': 'S\xc3\xa3o Paulo - Todos os Aeroportos (SAO)', 'ControlGroupSearch$SearchMainSearchView$TextBoxMarketDestination1': 'Jo\xc3\xa3o Pessoa (JPA)', 'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacOrigin1': 'on', 'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth1': '2018-08', 'ControlGroupSearch$SearchMainSearchView$RadioButtonMarketStructure': 'RoundTrip', 'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth2': '2018-08', 'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_ADT': '1', 'arrival': '23/08/2018', 'destinationIata1': 'JPA', '_authkey_': '106352422A4DEB0810953636A6FBE2079955529786098DE8B0D32416202E380E34C245FA99C431C7C7A75560FDE65150', 'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes': 'R', '__EVENTTARGET': 'ControlGroupSearch$LinkButtonSubmit', 'destination1': 'Jo\xc3\xa3o Pessoa (JPA)', 'ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay2': '23', 'hdfSearchCodeDeparture1': '1N', 'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD': '0', 'hdfSearchCodeArrival1': '1N', 'ControlGroupSearch$SearchMainSearchView$DropDownListSearchBy': 'columnView'};
            console.log(formData);
            console.log(coisa);
            console.log(formData === coisa);
            formData[MODE_PROP] = 'R'; //retrieving money response

            request.post({url: searchUrl, form: coisa, headers: headers, jar: cookieJar}, function (err, response) {
                console.log('...got first money info');
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
                    console.log('...got second money info');
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
                        console.log('...got first redeem info');
                        request.get({
                            url: 'https://viajemais.voeazul.com.br/Availability.aspx',
                            jar: cookieJar
                        }, function (err, response, body) {
                            console.log('...got second redeem info');
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
        console.log(err);
        exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.CRITICAL, new Date())
    }
}

