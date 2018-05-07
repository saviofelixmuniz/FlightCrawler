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
        const MODE_PROP = 'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes';

        var params = {
            adults: req.query.adults,
            children: req.query.children,
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
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

        request.get({url : 'https://www.voeazul.com.br/', jar : cookieJar, proxy: CONSTANTS.PROXY_URL, headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36'}}, function (err, response) {
            if (err) {
                exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, response.statusCode, MESSAGES.UNREACHABLE, new Date());
                return;
            }

            console.log('=================JAR 1=================');
            console.log(cookieJar);

            formData[MODE_PROP] = 'R'; //retrieving money response

            request.post({url : searchUrl, form : formData, jar: cookieJar, proxy: CONSTANTS.PROXY_URL, headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36'}}, function (err, response) {

                console.log('=================JAR 2=================');
                console.log(cookieJar);

                if (err) {
                    exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, response.statusCode, MESSAGES.UNREACHABLE, new Date());
                    return;
                }
                request.get({url : 'https://viajemais.voeazul.com.br/Availability.aspx', jar : cookieJar, proxy: CONSTANTS.PROXY_URL, headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36'}}, function (err, response, body) {

                    console.log('=================JAR 3=================');
                    console.log(cookieJar);

                    if (err) {
                        exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, response.statusCode, MESSAGES.UNREACHABLE, new Date());
                        return;
                    }

                    azulResponse.moneyResponse = body;

                    formData[MODE_PROP] = 'TD'; //retrieving redeem response

                    request.post({url : searchUrl, form : formData, jar: cookieJar, proxy: CONSTANTS.PROXY_URL, headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36'}}, function () {

                        console.log('=================JAR 4=================');
                        console.log(cookieJar);

                        request.get({url : 'https://viajemais.voeazul.com.br/Availability.aspx', jar : cookieJar, proxy: CONSTANTS.PROXY_URL, headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36'}}, function (err, response, body) {

                            console.log('=================JAR 5=================');
                            console.log(cookieJar);

                            request.get({url : 'https://viajemais.voeazul.com.br/SelectPriceBreakDownAjax.aspx?SellKeyIda=0~L~~L100AD~00OW~~48~X|AD~2463~%20~~JPA~05/20/2018%2007:25~REC~05/20/2018%2008:00~^AD~5101~%20~~REC~05/20/2018%2009:05~VCP~05/20/2018%2012:20~&SellKeyVolta=0~U~~U04CXMAT~WK0P~~435~X|AD~4488~%20~~GRU~05/28/2018%2018:30~REC~05/28/2018%2021:40~^AD~5087~%20~~REC~05/28/2018%2022:55~JPA~05/28/2018%2023:45~&QtdInstallments=1&TawsIdIda=undefined&TawsIdVolta=undefined&IsBusinessTawsIda=&IsBusinessTawsVolta=&DepartureIda=JPA,REC&DepartureTimeIda=07:25,09:05&ArrivalIda=REC,VCP&ArrivalTimeIda=08:00,12:20&DepartureVolta=GRU,REC&DepartureTimeVolta=18:30,22:55&ArrivalVolta=REC,JPA&ArrivalTimeVolta=21:40,23:45&FlightNumberIda=2463,5101&FlightNumberVolta=4488,5087&CarrierCodeIda=AD,AD&CarrierCodeVolta=AD,AD&STDIda=2018-05-20%2007:25:00|2018-05-20%2009:05:00&STDVolta=2018-05-28%2018:30:00|2018-05-28%2022:55:00', jar: cookieJar, proxy: CONSTANTS.PROXY_URL, headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36'}}, function (err, response, body) {
                                console.log('******************************************');
                                console.log(body);
                                console.log('******************************************');
                            });

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

                            // res.send(azulResponse.redeemResponse);
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
    } catch (err) {
        exception.handle(res, 'azul', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.CRITICAL, new Date())
    }
}

