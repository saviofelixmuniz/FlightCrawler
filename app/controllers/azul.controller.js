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
            formData[MODE_PROP] = 'R'; //retrieving money response

            request.post({url : searchUrl, form : formData, jar: cookieJar}, function (err, response) {
                console.log('...posted money info');
                if (err) {
                    exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, response.statusCode, MESSAGES.UNREACHABLE, new Date());
                    return;
                }
                request.get({url : 'https://viajemais.voeazul.com.br/Availability.aspx', jar : cookieJar}, function (err, response, body) {
                    console.log('...retrieved money info');

                    if (err) {
                        exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, response.statusCode, MESSAGES.UNREACHABLE, new Date());
                        return;
                    }

                    azulResponse.moneyResponse = body;
                    var cashCookieJar = Object.assign({}, cookieJar);

                    formData[MODE_PROP] = 'TD'; //retrieving redeem response
                    request.get({url : 'https://viajemais.voeazul.com.br/SelectPriceBreakDownAjax.aspx?SellKeyIda=0~H~~H100AD~00OW~~319~X|AD~5077~%20~~JPA~05/26/2018%2007:25~REC~05/26/2018%2008:00~^AD~4234~%20~~REC~05/26/2018%2009:10~FOR~05/26/2018%2010:35~^AD~4435~%20~~FOR~05/26/2018%2012:30~VCP~05/26/2018%2016:00~&SellKeyVolta=&QtdInstallments=1&TawsIdIda=undefined&TawsIdVolta=&IsBusinessTawsIda=&IsBusinessTawsVolta=&DepartureIda=JPA,REC,FOR&DepartureTimeIda=07:25,09:10,12:30&ArrivalIda=REC,FOR,VCP&ArrivalTimeIda=08:00,10:35,16:00&DepartureVolta=&DepartureTimeVolta=&ArrivalVolta=&ArrivalTimeVolta=&FlightNumberIda=5077,4234,4435&FlightNumberVolta=&CarrierCodeIda=AD,AD,AD&CarrierCodeVolta=&STDIda=2018-05-26%2007:25:00|2018-05-26%2009:10:00|2018-05-26%2012:30:00&STDVolta='}, function(err, response, body) {
                        console.log(body)
                        request.post({url : searchUrl, form : formData, jar: cookieJar}, function () {
                            console.log('...posted redemption info');
                            request.get({url : 'https://viajemais.voeazul.com.br/Availability.aspx', jar : cookieJar}, function (err, response, body) {
                                console.log('...retrieved redemption info');
                                if (err) {
                                    exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, response.statusCode, MESSAGES.UNREACHABLE, new Date());
                                    return;
                                }

                                azulResponse.redeemResponse = body;

                                var formattedData = Formatter.responseFormat(azulResponse.redeemResponse, azulResponse.moneyResponse, params, 'azul', cashCookieJar);

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
                                res.json({results : formattedData});
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

