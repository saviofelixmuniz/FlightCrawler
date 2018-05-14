/**
 * @author Sávio Muniz
 */

const request = require('requestretry');
const db = require('../helpers/db-helper');
const Formatter = require('../helpers/format.helper');
const CONSTANTS = require('../helpers/constants');
const exception = require('../helpers/exception');
const validator = require('../helpers/validator');
const MESSAGES = require('../helpers/messages');

const request2 = require('request');
const cookieJar = request.jar();

var fs = require('fs');

module.exports = getFlightInfo;

const LATAM_TEMPLATE_CHANGE_DATE = CONSTANTS.LATAM_TEMPLATE_CHANGE_DATE;

function formatRedeemUrl(params, isGoing) {
    return `https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/redemption/recommendations/oneway?country=BR&language=PT&
            home=pt_br&origin=${isGoing ? params.originAirportCode : params.destinationAirportCode}&
            destination=${isGoing ? params.destinationAirportCode : params.originAirportCode}&
            departure=${isGoing ? params.departureDate : params.returnDate}&adult=1&cabin=Y&tierType=low`.replace(/\s+/g, '');
}


function formatCashUrl(params, isGoing) {
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
    const START_TIME = (new Date()).getTime();

    try {
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

        console.log('NEW FORMAT!!!');
        request.get({
            url: formatRedeemUrl(params, true),
            maxAttempts: 3,
            retryDelay: 150
        }).then(function (response) {
            var redeemResponse = {going : JSON.parse(response.body), returning : {}};
            console.log('...got first redeem read');
            request.get({
                url: formatCashUrl(params, true),
                maxAttempts: 3,
                retryDelay: 150
            }).then(function (response) {
                console.log('...got first cash read');
                var cashResponse = {going : JSON.parse(response.body), returning : {}};

                if (params.returnDate) {
                    request.get({
                        url: formatCashUrl(params, false),
                        maxAttempts: 3,
                        retryDelay: 150
                    }).then(function (response) {
                        console.log('...got second cash read');
                        cashResponse.returning = JSON.parse(response.body);

                        request.get({
                            url: formatRedeemUrl(params, false),
                            maxAttempts: 3,
                            retryDelay: 150
                        }).then(function (response) {
                            console.log('...got second redeem read');
                            redeemResponse.returning = JSON.parse(response.body);

                            console.log(redeemResponse);
                            var formattedData = Formatter.responseFormat(redeemResponse, cashResponse, params, 'latam');

                            if (formattedData.error) {
                                exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                                return;
                            }

                            if (!validator.isFlightAvailable(formattedData)) {
                                exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                                return;
                            }

                            res.json(formattedData);
                            db.saveRequest('latam', (new Date()).getTime() - START_TIME, params, null, 200, new Date());
                        }, function (err) {
                            exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.UNREACHABLE, new Date());
                        });

                    }, function (err) {
                        exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.UNREACHABLE, new Date());
                    });
                }

                else {
                    var formattedData = Formatter.responseFormat(redeemResponse, cashResponse, params, 'latam');

                    if (formattedData.error) {
                        exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                        return;
                    }

                    if (!validator.isFlightAvailable(formattedData)) {
                        exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                        return;
                    }

                    res.json(formattedData);
                    db.saveRequest('latam', (new Date()).getTime() - START_TIME, params, null, 200, new Date());
                }
            }, function (err) {
                exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.UNREACHABLE, new Date());
            });
        }, function (err) {
            exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.UNREACHABLE, new Date());
        });
    } catch (err) {
        exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.CRITICAL, new Date());
    }

}