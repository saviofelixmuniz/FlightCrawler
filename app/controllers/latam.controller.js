/**
 * @author Sávio Muniz
 */

const request = require('requestretry');
const Formatter = require('../helpers/format.helper');
const CONSTANTS = require('../helpers/constants');

const request2 = require('request');
const cookieJar = request.jar();

var fs = require('fs');

module.exports = getFlightInfo;

const LATAM_TEMPLATE_CHANGE_DATE = CONSTANTS.LATAM_TEMPLATE_CHANGE_DATE;

function formatOldRedeemUrl(params) {
    var url =  `https://book.latam.com/TAM/dyn/air/redemption/availability;jsessionid=96_YERVnseBRWRvsSYipVzCPizdWG891BBKYOOJ49Tt6v0bVmSE-!-857973753!1314580488?
            B_DATE_1=${formatDate(params.departureDate)}&B_LOCATION_1=${params.originAirportCode}&LANGUAGE=BR
            &passenger_useMyPoints=true&WDS_MARKET=BR&children=${params.children}&E_LOCATION_1=${params.destinationAirportCode}&
            SERVICE_ID=2&SITE=JJRDJJRD&COUNTRY_SITE=BR&MARKETING_CABIN=E&adults=${params.adults}&infants=${params.infants}&TRIP_TYPE=R`.replace(/\s+/g, '');

    if (params.returnDate)
        url += `&B_DATE_2=${formatDate(params.returnDate)}`;

    return url;
}

function formatOldCashUrl(params) {
    var url = `http://book.latam.com/TAM/dyn/air/booking/upslDispatcher?B_LOCATION_1=${params.originAirportCode}&
            E_LOCATION_1=${params.destinationAirportCode}&TRIP_TYPE=R&B_DATE_1=${formatDate(params.departureDate)}&
            adults=${params.adults}&children=${params.children}&infants=${params.infants}&
            LANGUAGE=BR&SITE=JJBKJJBK&WDS_MARKET=BR&MARKETING_CABIN=E`.replace(/\s+/g, '');
    if (params.returnDate)
        url += `&B_DATE_2=${formatDate(params.returnDate)}`;

    return url;
}

function formatNewCashUrl(params,isGoing) {
    return `https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/revenue/recommendations/oneway?country=BR&language=PT&
            home=pt_br&origin=${isGoing ? params.originAirportCode : params.destinationAirportCode}&
            destination=${isGoing ? params.destinationAirportCode : params.originAirportCode}&
            departure=${isGoing ? params.departureDate : params.returnDate}&adult=1&cabin=Y`.replace(/\s+/g, '');
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

    if(params.returnDate) {
        var returnDate = new Date();
        returnDate.setDate(params.returnDate.split('-')[2]);
        returnDate.setMonth(params.returnDate.split('-')[1] - 1);
        returnDate.setFullYear(params.returnDate.split('-')[0]);
    }

    else {
        var departureDate = new Date();
        departureDate.setDate(params.departureDate.split('-')[2]);
        departureDate.setMonth(params.departureDate.split('-')[1] - 1);
        departureDate.setFullYear(params.departureDate.split('-')[0]);
    }

    if (returnDate ? returnDate < LATAM_TEMPLATE_CHANGE_DATE : departureDate <= LATAM_TEMPLATE_CHANGE_DATE) {
        request.get({
            url: formatOldRedeemUrl(params),
            maxAttempts: 3,
            retryDelay: 150
        }).then(function (response) {
            console.log('...got a read');
            redeemResult = response.body;
            var cashResult = null;

            request.get({
                url: formatOldCashUrl(params),
                maxAttempts: 3,
                retryDelay: 150
            }).then(function (response) {
                console.log('...got a read');
                cashResult = response.body;

                var formattedData = Formatter.responseFormat(redeemResult, cashResult, params, 'latam');

                res.json(formattedData);

            }, function (err) {
                cashResult = err;
                return cashResult;
            });
        }, function (err) {
            redeemResult = err;
            return redeemResult;
        });
    }

    else {
        console.log('NEW FORMAT!!!');
        request.get({
            url: formatOldRedeemUrl(params),
            maxAttempts: 3,
            retryDelay: 150
        }).then(function (response) {
            var redeemResponse = response.body;
            console.log('...got a redeem read');
            request.get({
                url: formatNewCashUrl(params, true),
                maxAttempts: 3,
                retryDelay: 150
            }).then(function (response) {
                console.log('...got first cash read');
                var cashResponse = {going : JSON.parse(response.body), returning : {}};

                if (params.returnDate) {
                    request.get({
                        url: formatNewCashUrl(params, false),
                        maxAttempts: 3,
                        retryDelay: 150
                    }).then(function (response) {
                        console.log('...got second cash read');
                        cashResponse.returning = JSON.parse(response.body);

                        var formattedData = Formatter.responseFormat(redeemResponse, cashResponse, params, 'latam');

                        res.json(formattedData);
                    }, function (err) {
                        res.send(err);
                    });
                }

                else {
                    var formattedData = Formatter.responseFormat(redeemResponse, cashResponse, params, 'latam');

                    res.json(formattedData);
                }

            }, function (err) {
                res.send(err);
            });
        }, function (err) {
            res.send(err);
        });
    }
}