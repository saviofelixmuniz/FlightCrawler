/**
 * @author Sávio Muniz
 */
module.exports = getFlightInfo;
const request = require('request');
const db = require('../helpers/db-helper');
const cookieJar = request.jar();
const Formatter = require('../helpers/format.helper');
const CONSTANTS = require('../helpers/constants');
const exception = require('../helpers/exception');
const MESSAGES = require('../helpers/messages');
const validator = require('../helpers/validator');


function getFlightInfo(req, res, next) {
    const START_TIME = (new Date()).getTime();

    try {
        var searchUrl = 'https://viajemais.voeazul.com.br/Search.aspx';
        var stationSearchUrl = 'https://interline.voeazul.com.br/Sell/RetonaListStationsFiltrada';
        const MODE_PROP = 'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes';

        var params = {
            adults: req.query.adults,
            children: req.query.children,
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            international: req.query.international == 'true',
            forceCongener: false,
            infants: 0
        };

        var formData = {
            _authkey_:'106352422A4DEB0810953636A6FBE2079955529786098DE8B0D32416202E380E34C245FA99C431C7C7A75560FDE65150',
            __EVENTTARGET:'ControlGroupSearch$LinkButtonSubmit',
            ControlGroupSearch$SearchMainSearchView$DropDownListSearchBy:'columnView',
            culture:'pt-BR',
            ControlGroupSearch$SearchMainSearchView$TextBoxPromoCode:'CALLCENT',
            ControlGroupSearch$SearchMainSearchView$RadioButtonMarketStructure:'RoundTrip',
            origin1:'',
            ControlGroupSearch$SearchMainSearchView$TextBoxMarketOrigin1:`(${params.originAirportCode})`,
            ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacOrigin1:'',
            hdfSearchCodeDeparture1:'1N',
            originIata1:'',
            destination1:'',
            ControlGroupSearch$SearchMainSearchView$TextBoxMarketDestination1:`(${params.destinationAirportCode})`,
            ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacDestination1:'on',
            hdfSearchCodeArrival1:'1N',
            destinationIata1:'',
            departure1:'',
            ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay1:`${params.departureDate.split('-')[2]}`,
            ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth1:`${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
            arrival:'',
            ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay2:`${params.returnDate.split('-')[2]}`,
            ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth2:`${params.returnDate.split('-')[0]}-${params.returnDate.split('-')[1]}`,
            originIata2:'',
            destinationIata2:'',
            ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_ADT:`${params.adults || 1}`,
            ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD:0,
            ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT:0
        };


        var azulResponse = {moneyResponse : null, redeemResponse: null};

        if (params.international) {
            request.post({url: stationSearchUrl, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({txtDigitado: params.destinationAirportCode})}, function (err, response) {
                if (err) {
                    res.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, response.statusCode ? 500 : response.statusCode, MESSAGES.UNREACHABLE, new Date());
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
            request.get({url : 'https://www.voeazul.com.br/', jar : cookieJar}, function (err, response) {
                if (err) {
                    exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, response.statusCode, MESSAGES.UNREACHABLE, new Date());
                    return;
                }

                formData[MODE_PROP] = 'R'; //retrieving money response

                request.post({url : searchUrl, form : formData, jar: cookieJar}, function (err, response) {
                    if (err) {
                        exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, response.statusCode, MESSAGES.UNREACHABLE, new Date());
                        return;
                    }
                    request.get({url : 'https://viajemais.voeazul.com.br/Availability.aspx', jar : cookieJar}, function (err, response, body) {
                        if (err) {
                            exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, response.statusCode, MESSAGES.UNREACHABLE, new Date());
                            return;
                        }

                        azulResponse.moneyResponse = body;

                        formData[MODE_PROP] = 'TD'; //retrieving redeem response

                        request.post({url : searchUrl, form : formData, jar: cookieJar}, function () {
                            request.get({url : 'https://viajemais.voeazul.com.br/Availability.aspx', jar : cookieJar}, function (err, response, body) {
                                if (err) {
                                    exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, response.statusCode, MESSAGES.UNREACHABLE, new Date());
                                    return;
                                }

                                azulResponse.redeemResponse = body;

                                var formattedData = Formatter.responseFormat(azulResponse.redeemResponse, azulResponse.moneyResponse, params, 'azul', cookieJar);

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
                                res.json(formattedData);
                                db.saveRequest('azul', (new Date()).getTime() - START_TIME, params, null, 200, new Date());

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
            });
        }

    } catch (err) {
        exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.CRITICAL, new Date())
    }
}

