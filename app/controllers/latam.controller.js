/**
 * @author Sávio Muniz
 */

const db = require('../helpers/db-helper');
const Formatter = require('../helpers/format.helper');
const CONSTANTS = require('../helpers/constants');
const exception = require('../helpers/exception');
const validator = require('../helpers/validator');
const MESSAGES = require('../helpers/messages');
const Proxy = require ('../helpers/proxy');

var request = Proxy.setupAndRotateRequestLib('requestretry');

module.exports = getFlightInfo;

function formatUrl(params, isGoing, cash, isOneway, fareId) {
    var getFlightCabin = function (executive) {
        return executive && executive !== 'false' ? (executive === 'economy' ? 'W' : 'J' ): 'Y';
    };

    return `https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/${cash ? 'revenue' : 'redemption'}/
            recommendations/${isOneway ? 'oneway' : (isGoing ? 'outbound' : 'inbound')}?country=BR&language=PT&
            home=pt_br&origin=${params.originAirportCode}&destination=${params.destinationAirportCode}&
            departure=${params.departureDate}&adult=${params.adults}&cabin=${getFlightCabin(params.executive)}
            ${isOneway ? '' : `&return=${params.returnDate}`}${isGoing ? '' : `&fareId=${fareId}`}${cash ? '' : '&tierType=low'}`.replace(/\s+/g, '');
}

function getFlightInfo(req, res, next) {
    const START_TIME = (new Date()).getTime();

    try {
        request = Proxy.setupAndRotateRequestLib('requestretry');

        var params = {
            adults: req.query.adults,
            children: req.query.children,
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            executive: req.query.executive,
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


        if (params.returnDate) {
            getOnewayFlights(params, res, START_TIME)
        }

    } catch (err) {
        exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.CRITICAL, new Date());
    }

}

function getOnewayFlights(params, res, START_TIME) {
    var isOneWay = !params.returnDate;

    request.get({
        url: formatUrl(params, true, false, isOneWay),
        maxAttempts: 3,
        retryDelay: 150
    }).then(function (response) {
        var redeemResponse = {going : JSON.parse(response.body), returning : {}};
        console.log('...got first redeem read');
        request.get({
            url: formatUrl(params, true, true, isOneWay),
            maxAttempts: 3,
            retryDelay: 150
        }).then(function (response) {
            console.log('...got first cash read');
            var cashResponse = {going : JSON.parse(response.body), returning : {}};
            var firstFareId = cashResponse.going.data.flights[0].cabins[0].fares[0].fareId;

            if (isOneWay) {
                var formattedData = Formatter.responseFormat(redeemResponse, cashResponse, params, 'latam');

                if (formattedData.error) {
                    exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                    return;
                }

                if (!validator.isFlightAvailable(formattedData)) {
                    exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                    return;
                }

                res.json({results : formattedData});
                db.saveRequest('latam', (new Date()).getTime() - START_TIME, params, null, 200, new Date());

            }

            else {
                request.get({
                    url: formatUrl(params, false, true, isOneWay, firstFareId),
                    maxAttempts: 3,
                    retryDelay: 150
                }).then(function (response) {
                    console.log('...got second cash read');
                    cashResponse.returning = JSON.parse(response.body);
                    firstFareId = redeemResponse.going.data.flights[0].cabins[0].fares[0].fareId;   
                    request.get({
                        url: formatUrl(params, false, false, isOneWay, firstFareId),
                        maxAttempts: 3,
                        retryDelay: 150
                    }).then(function (response) {
                        console.log('...got second redeem read');
                        redeemResponse.returning = JSON.parse(response.body);

                        var formattedData = Formatter.responseFormat(redeemResponse, cashResponse, params, 'latam');

                        if (formattedData.error) {
                            exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                            return;
                        }

                        if (!validator.isFlightAvailable(formattedData)) {
                            exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                            return;
                        }

                        res.json({results : formattedData});
                        db.saveRequest('latam', (new Date()).getTime() - START_TIME, params, null, 200, new Date());
                    }, function (err) {
                        exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.UNREACHABLE, new Date());
                    });

                }, function (err) {
                    exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.UNREACHABLE, new Date());
                });
            }
        }, function (err) {
            exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.UNREACHABLE, new Date());
        });
    }, function (err) {
        exception.handle(res, 'latam', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.UNREACHABLE, new Date());
    });
}