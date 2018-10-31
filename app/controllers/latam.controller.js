/**
 * @author Sávio Muniz
 */
const errorSolver = require("../util/helpers/error-solver");
const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
const exception = require('../util/services/exception');
const validator = require('../util/helpers/validator');
const MESSAGES = require('../util/helpers/messages');
const Proxy = require ('../util/services/proxy');
const Unicorn = require('../util/services/unicorn/unicorn');
const PreFlightServices = require('../util/services/preflight');

module.exports = getFlightInfo;

function formatUrl(params, isGoing, cash, isOneway, fareId) {
    var getFlightCabin = function (executive) {
        return executive ? (executive === 'economy' ? 'W' : 'J' ): 'Y';
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
        var params = {
            IP: req.clientIp,
            client: req.clientName || "",
            api_key: req.headers['authorization'],
            adults: req.query.adults,
            children: req.query.children,
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            executive: req.query.executive === 'true',
            originCountry: req.query.originCountry || 'BR',
            destinationCountry: req.query.destinationCountry || 'BR',
            forceCongener: false,
            infants: 0
        };

        if (await PreFlightServices(params, startTime, 'latam', res)) {
            return;
        }

        var latamResponse = await makeRequests(params, startTime, res);
        if (!latamResponse || !latamResponse.redeemResponse || !latamResponse.moneyResponse) return;

        Formatter.responseFormat(latamResponse.redeemResponse, latamResponse.moneyResponse, params, 'latam').then(async function (formattedData) {
            if (formattedData.error) {
                console.log(formattedData.error);
                exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, formattedData.error, 500, MESSAGES.PARSE_ERROR, new Date());
                return;
            }

            if (!validator.isFlightAvailable(formattedData)) {
                exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                return;
            }

            var request = await db.saveRequest('latam', (new Date()).getTime() - startTime, params, null, 200, formattedData);
            res.status(200);
            res.json({results : formattedData, id: request._id});
        });

    } catch (err) {
        errorSolver.solveFlightInfoErrors('latam', err, res, startTime, params);
    }

}

function makeRequests(params, startTime, res) {
    return Promise.all([getCashResponse(params, startTime, res),getRedeemResponse(params, startTime, res)]).then(function (results) {
        if (results[0].err) {
            throw {err : true, code : results[0].code, message : results[0].message, stack : results[0].stack};
        }
        if (results[1].err) {
            throw {err : true, code : results[1].code, message : results[1].message, stack : results[1].stack};
        }
        return {moneyResponse: results[0], redeemResponse: results[1]};
    });
}

async function getCashResponse(params) {
    const session = Proxy.createSession('latam');

    var isOneWay = !params.returnDate;

    try {
        let response = await Proxy.require({
            session: session,
            request: {
                url: formatUrl(params, true, true, isOneWay)
            }
        });

        console.log('LATAM:  ...got first cash read');
        var cashResponse = {going: JSON.parse(response), returning: {}};

        if (!cashResponse.going.data.flights[0]) {
            return {err: true, code: 404, message: MESSAGES.UNAVAILABLE};
        }

        if (isOneWay)
            return cashResponse;

        var firstFareId = cashResponse.going.data.flights[0].cabins[0].fares[0].fareId;

        response = await Proxy.require({
            session: session,
            request: {
                url: formatUrl(params, false, true, isOneWay, firstFareId)
            }
        });

        console.log('LATAM:  ...got second cash read');
        cashResponse.returning = JSON.parse(response);

        Proxy.killSession(session);
        return cashResponse;
    } catch (err) {
        Proxy.killSession(session);
        let err_status = errorSolver.getHttpStatusCodeFromMSG(err.message);
        let err_code = parseInt(err_status);
        return {err: true, code: err_code, message: err.message, stack : err.stack}
    }
}

async function getRedeemResponse(params) {
    const session = Proxy.createSession('latam');
    var isOneWay = !params.returnDate;

    try {
        let response = await Proxy.require({
            session: session,
            request: {
                url: formatUrl(params, true, false, isOneWay)
            }
        });

        var redeemResponse = {going: JSON.parse(response), returning: {}};
        console.log('LATAM:  ...got first redeem read');

        if (!redeemResponse.going.data.flights[0]) {
            return {err: true, code: 404, message: MESSAGES.UNAVAILABLE};
        }

        if (isOneWay)
            return redeemResponse;

        var firstFareId = redeemResponse.going.data.flights[0].cabins[0].fares[0].fareId;

        response = await Proxy.require({
            session: session,
            request: {
                url: formatUrl(params, false, false, isOneWay, firstFareId)
            }
        });

        console.log('LATAM:  ...got second redeem read');
        redeemResponse.returning = JSON.parse(response);
        Proxy.killSession(session);
        return redeemResponse;
    } catch (err) {
        Proxy.killSession(session);
        let err_status = errorSolver.getHttpStatusCodeFromMSG(err.message);
        let err_code = parseInt(err_status);
        return {err: true, code: err_code, message: err.message, stack : err.stack}
    }
}
