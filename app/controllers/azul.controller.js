/**
 * @author Sávio Muniz
 */
module.exports = getFlightInfo;
const request = require('request');
const cookieJar = request.jar();
const Formatter = require('../helpers/format.helper');
const exception = require('../helpers/exception-helper');

function getFlightInfo(req, res, next) {
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
        ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_ADT:1,
        ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD:0,
        ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT:0
    };


    var azulResponse = {moneyResponse : null, redeemResponse: null};

    request.get({url : 'https://www.voeazul.com.br/', jar : cookieJar}, function () {
        formData[MODE_PROP] = 'R'; //retrieving money response

        request.post({url : searchUrl, form : formData, jar: cookieJar}, function () {
            request.get({url : 'https://viajemais.voeazul.com.br/Availability.aspx', jar : cookieJar}, function (err, response, body) {
                azulResponse.moneyResponse = body;

                formData[MODE_PROP] = 'TD'; //retrieving redeem response

                request.post({url : searchUrl, form : formData, jar: cookieJar}, function () {
                    request.get({url : 'https://viajemais.voeazul.com.br/Availability.aspx', jar : cookieJar}, function (err, response, body) {
                        azulResponse.redeemResponse = body;

                        var formattedData = Formatter.responseFormat(azulResponse.redeemResponse, azulResponse.moneyResponse, params, 'azul');

                        exception.noFlightChecker(formattedData, res);

                        res.json(formattedData);
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