/**
 * @author Sávio Muniz
 */

const db = require('../helpers/db-helper');
const Formatter = require('../helpers/format.helper');
const exception = require('../helpers/exception');
const validator = require('../helpers/validator');
const MESSAGES = require('../helpers/messages');
const Proxy = require ('../helpers/proxy');

var request = Proxy.setupAndRotateRequestLib('requestretry', 'latam');

module.exports = getFlightInfo;

function formatUrl(params, isGoing, cash, isOneway, fareId) {
    var getFlightCabin = function (executive) {
        return executive && executive !== 'false' ? (executive === 'economy' ? 'W' : 'J' ): 'Y';
    };

    return `https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/${cash ? 'revenue' : 'redemption'}/
            recommendations/${isOneway ? 'oneway' : (isGoing ? 'outbound' : 'inbound')}?country=BR&language=PT&
            home=pt_br&origin=${params.originAirportCode}&destination=${params.destinationAirportCode}&
            departure=${params.departureDate}&adult=${params.adults}&
            ${params.children && params.children > 0 ? `child=${params.children}&` : ''}
            cabin=${getFlightCabin(params.executive)}${isOneway ? '' : `&return=${params.returnDate}`}
            ${isGoing ? '' : `&fareId=${fareId}`}${cash ? '' : '&tierType=low'}`.replace(/\s+/g, '');
}

async function getFlightInfo(req, res, next) {
    var startTime = (new Date()).getTime();

    console.log('Searching Latam...');
    try {
        request = Proxy.setupAndRotateRequestLib('requestretry');

        var params = {
            IP: req.clientIp,
            api_key: req.headers['authorization'],
            adults: req.query.adults,
            children: req.query.children,
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            executive: req.query.executive,
            originCountry: req.query.originCountry || 'BR',
            destinationCountry: req.query.destinationCountry || 'BR',
            forceCongener: false,
            infants: 0
        };

        var cached = await db.getCachedResponse(params, new Date(), 'latam');
        if (cached) {
            db.saveRequest('latam', (new Date()).getTime() - startTime, params, null, 200, null);
            res.status(200);
            res.json({results: cached});
            return;
        }

        var latamResponse = await makeRequests(params, startTime, res);

        Formatter.responseFormat(latamResponse.redeemResponse, latamResponse.moneyResponse, params, 'latam').then(function (formattedData) {
            if (formattedData.error) {
                console.log(formattedData.error);
                exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                return;
            }

            if (!validator.isFlightAvailable(formattedData)) {
                exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                return;
            }

            res.json({results : formattedData});
            db.saveRequest('latam', (new Date()).getTime() - startTime, params, null, 200, formattedData);
        });

    } catch (err) {
        exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, err, 400, MESSAGES.CRITICAL, new Date());
    }

}
function makeRequests(params, startTime, res) {
    return Promise.all([getCashResponse(params, startTime, res),getRedeemResponse(params, startTime, res)]).then(function (results) {
        return {moneyResponse: results[0], redeemResponse: results[1]};
    });
}

function getCashResponse(params, startTime, res) {
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'latam');

    var isOneWay = !params.returnDate;

    return request.get({
        url: formatUrl(params, true, true, isOneWay),
        maxAttempts: 3,
        retryDelay: 150
    }).then(function (response) {
        console.log('LATAM:  ...got first cash read');
        var cashResponse = {going: JSON.parse(response), returning: {}};

        if (isOneWay)
            return cashResponse;

        var firstFareId = cashResponse.going.data.flights[0].cabins[0].fares[0].fareId;

        return request.get({
            url: formatUrl(params, false, true, isOneWay, firstFareId),
            maxAttempts: 3,
            retryDelay: 150
        }).then(function (response) {
            console.log('LATAM:  ...got second cash read');
            cashResponse.returning = JSON.parse(response);
            return cashResponse;
        }).catch(function (err) {
            exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, err, 400, MESSAGES.UNREACHABLE, new Date());
        });
    }).catch(function (err) {
        exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, err, 400, MESSAGES.UNREACHABLE, new Date());
    });
}

function getRedeemResponse(params, startTime, res) {
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'latam');

    var isOneWay = !params.returnDate;

    return request.get({
        url: formatUrl(params, true, false, isOneWay),
        maxAttempts: 3,
        retryDelay: 150
    }).then(function (response) {
        var redeemResponse = {going: JSON.parse(response), returning: {}};
        console.log('LATAM:  ...got first redeem read');

        if (!redeemResponse.going.data.flights[0]) {
            exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
            return;
        }

        if (isOneWay)
            return redeemResponse;

        var firstFareId = redeemResponse.going.data.flights[0].cabins[0].fares[0].fareId;

        return request.get({
            url: formatUrl(params, false, false, isOneWay, firstFareId),
            maxAttempts: 3,
            retryDelay: 150
        }).then(function (response) {
            console.log('LATAM:  ...got second redeem read');
            redeemResponse.returning = JSON.parse(response);
            return redeemResponse;
        }).catch(function (err) {
            exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, err, 400, MESSAGES.UNREACHABLE, new Date());
        })
    }).catch(function (err) {
        exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, err, 400, MESSAGES.UNREACHABLE, new Date());
    });
}