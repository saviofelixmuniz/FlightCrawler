/**
 * @author Sávio Muniz
 */

const request = require('requestretry');
const Formatter = require('../helpers/format.helper');

var fs = require('fs');

module.exports = getFlightInfo;

function formatRedeemUrl(params) {
    var url =  `https://book.latam.com/TAM/dyn/air/redemption/availability;jsessionid=96_YERVnseBRWRvsSYipVzCPizdWG891BBKYOOJ49Tt6v0bVmSE-!-857973753!1314580488?
            B_DATE_1=${formatDate(params.departureDate)}&B_LOCATION_1=${params.originAirportCode}&LANGUAGE=BR
            &passenger_useMyPoints=true&WDS_MARKET=BR&children=${params.children}&E_LOCATION_1=${params.destinationAirportCode}&
            SERVICE_ID=2&SITE=JJRDJJRD&COUNTRY_SITE=BR&MARKETING_CABIN=E&adults=${params.adults}&infants=${params.infants}&TRIP_TYPE=R`.replace(/\s+/g, '');
    if (params.returnDate)
        url += `&B_DATE_2=${formatDate(params.returnDate)}`;

    return url;
}

function formatCashUrl(params) {
    var url = `http://book.latam.com/TAM/dyn/air/booking/upslDispatcher?B_LOCATION_1=${params.originAirportCode}&
            E_LOCATION_1=${params.destinationAirportCode}&TRIP_TYPE=R&B_DATE_1=${formatDate(params.departureDate)}&
            adults=${params.adults}&children=${params.children}&infants=${params.infants}&
            LANGUAGE=BR&SITE=JJBKJJBK&WDS_MARKET=BR&MARKETING_CABIN=E`.replace(/\s+/g, '');
    if (params.returnDate)
        url += `&B_DATE_2=${formatDate(params.returnDate)}`;

    return url;
}

function formatDate(date) {
    var splitDate = date.split('-');
    return splitDate[0] + splitDate[1] + splitDate[2] + '0000';
}

function getFlightInfo(req, res, next) {
    var redeemResult = null;

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

    request.get({
        url: formatRedeemUrl(params),
        maxAttempts: 3,
        retryDelay: 150
    }).then(function (response) {
        console.log('...got a read');
        redeemResult = response.body;
        var cashResult = null;

        request.get({
            url: formatCashUrl(params),
            maxAttempts: 3,
            retryDelay: 150
        }).then(function (response) {
            console.log('...got a read');
            cashResult = response.body;

            var formattedData = Formatter.responseFormat(redeemResult, cashResult, params, 'latam');
            var data = {
                formattedData : formattedData,
                tamCashData : ''
            };
            res.json(data);

        }, function (err) {
            cashResult = err;
            return cashResult;
        });
    }, function (err) {
        redeemResult = err;
        return redeemResult;
    });

}