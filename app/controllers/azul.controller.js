/**
 * @author Sávio Muniz
 */
module.exports = getFlightInfo;
const db = require('../helpers/db-helper');
const Formatter = require('../helpers/format.helper');
const exception = require('../helpers/exception');
const MESSAGES = require('../helpers/messages');
const validator = require('../helpers/validator');
const Proxy = require ('../helpers/proxy');


const SEARCH_URL = 'https://viajemais.voeazul.com.br/Search.aspx';
const MODE_PROP = 'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes';

async function getFlightInfo(req, res, next) {
    var startTime = (new Date()).getTime();

    console.log('Searching Azul...');
    try {
        var params = {
            IP: req.clientIp,
            api_key: req.headers['authorization'],
            adults: req.query.adults,
            children: req.query.children ? req.query.children : '0',
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            originCountry: req.query.originCountry || 'BR',
            destinationCountry: req.query.destinationCountry || 'BR',
            forceCongener: false,
            infants: 0
        };

        var cached = await db.getCachedResponse(params, new Date(), 'azul');
        if (cached) {
            db.saveRequest('azul', (new Date()).getTime() - startTime, params, null, 200, null);
            res.status(200);
            res.json({results: cached});
            return;
        }

        var azulResponse = await makeRequests(params, startTime, res);
        if (!azulResponse || !azulResponse.redeemResponse || !azulResponse.moneyResponse) return;

        Formatter.responseFormat(azulResponse.redeemResponse, azulResponse.moneyResponse, params, 'azul').then(async function (formattedData) {
            if (formattedData.error) {
                exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                return;
            }

            if (!validator.isFlightAvailable(formattedData)) {
                exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                return;
            }

            var request = await db.saveRequest('azul', (new Date()).getTime() - startTime, params, null, 200, formattedData);
            res.status(200);
            res.json({results: formattedData, id: request._id});
        });
    } catch (err) {
        console.log(err);
        exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 400, MESSAGES.CRITICAL, new Date())
    }
}

function makeRequests(params, startTime, res) {
    return Promise.all([getCashResponse(params, startTime, res),getRedeemResponse(params, startTime, res)]).then(function (results) {
        if (results[0].err) {
            exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, results[0].err, results[0].code, results[0].message, new Date());
            return null;
        }
        if (results[1].err) {
            exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, results[1].err, results[1].code, results[1].message, new Date());
            return null;
        }
        return {moneyResponse: results[0], redeemResponse: results[1]};
    });
}

function getCashResponse(params, startTime, res) {
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'azul');
    var formData = Formatter.formatAzulForm(params, !params.returnDate);
    formData[MODE_PROP] = 'R'; //retrieving money response

    var headers = Formatter.formatAzulHeaders(formData, 'post');

    var cookieJar = request.jar();

    return request.post({url: SEARCH_URL, form: formData, headers: headers, jar: cookieJar}).then(function () {
        console.log('AZUL:  ...got first money info');

        return request.get({
            url: 'https://viajemais.voeazul.com.br/Availability.aspx',
            jar: cookieJar
        }).then(function (body) {
            console.log('AZUL:  ...got second money info');
            return body;
        }).catch(function (err) {
            return {err: err, code: 500, message: MESSAGES.UNREACHABLE};
        })
    }).catch(function (err) {
        return {err: err, code: 500, message: MESSAGES.UNREACHABLE};
    });
}

function getRedeemResponse(params, startTime, res) {
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'azul');
    var formData = Formatter.formatAzulForm(params, !params.returnDate);
    formData[MODE_PROP] = 'TD'; //retrieving redeem response

    var headers = Formatter.formatAzulHeaders(formData, 'post');

    var cookieJar = request.jar();

    if (!formData || formData.hdfSearchCodeArrival1 !== '1N' || formData.hdfSearchCodeDeparture1 !== '1N') {
        return {err: true, code: 404, message: MESSAGES.NO_AIRPORT};
    }

    return request.post({url: SEARCH_URL, form: formData, headers: headers, jar: cookieJar}).then(function () {
        console.log('AZUL:  ...got first redeem info');
        return request.get({
            url: 'https://viajemais.voeazul.com.br/Availability.aspx',
            jar: cookieJar
        }).then(function (body) {
            console.log('AZUL:  ...got second redeem info');
            return body;
        }).catch(function (err) {
            return {err: err, code: 500, message: MESSAGES.UNREACHABLE};
        })
    }).catch(function (err) {
        return {err: err, code: 500, message: MESSAGES.UNREACHABLE};
    });
}
