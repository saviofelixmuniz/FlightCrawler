/**
 * @author Sávio Muniz
 */

const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
const exception = require('../util/services/exception');
const validator = require('../util/helpers/validator');
const MESSAGES = require('../util/helpers/messages');
const Proxy = require ('../util/services/proxy');
const Unicorn = require('../util/services/unicorn/unicorn');
const PreFlightServices = require('../util/services/preflight');
var Confianca = require('../util/helpers/confianca-crawler');

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
            infants: 0,
            confianca: false
        };

        if (await PreFlightServices(params, startTime, 'latam', res)) {
            return;
        }

        var latamResponse = await makeRequests(params, startTime, res);
        if (!latamResponse || !latamResponse.redeemResponse || !latamResponse.moneyResponse) return;

        Formatter.responseFormat(latamResponse.redeemResponse, latamResponse.moneyResponse, latamResponse.confiancaResponse, params, 'latam').then(async function (formattedData) {
            if (formattedData.error) {
                console.log(formattedData.error);
                exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
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
        exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, err.stack, 400, MESSAGES.CRITICAL, new Date());
    }

}
function makeRequests(params, startTime, res) {
    return Promise.all([getCashResponse(params, startTime, res),getRedeemResponse(params, startTime, res), getConfiancaResponse(params, startTime, res)]).then(function (results) {
        if (results[0].err) {
            exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, results[0].err, results[0].code, results[0].message, new Date());
            return null;
        }
        if (results[1].err) {
            exception.handle(res, 'latam', (new Date()).getTime() - startTime, params, results[1].err, results[1].code, results[1].message, new Date());
            return null;
        }
        return {moneyResponse: results[0], redeemResponse: results[1], confiancaResponse: results[2]};
    });
}

async function getCashResponse(params) {
    if (params.confianca === true) {
        return {
            going: {
                data: {
                    flights: []
                }
            },
            returning: {}
        };
    }

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
        return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
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
        return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
    }
}

function getConfiancaResponse(params, startTime, res) {
    return Confianca(params);
}