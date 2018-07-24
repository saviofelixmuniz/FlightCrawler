/**
 * @author Sávio Muniz
 */
module.exports = getFlightInfo;
const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
const exception = require('../util/services/exception');
const MESSAGES = require('../util/helpers/messages');
const validator = require('../util/helpers/validator');
const Proxy = require ('../util/services/proxy');


const SEARCH_URL = 'https://viajemais.voeazul.com.br/Search.aspx';
const MODE_PROP = 'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes';

async function getFlightInfo(req, res, next) {
    let startTime = (new Date()).getTime();

    console.log('Searching Azul...');
    try {
        let params = {
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

        let cached = await db.getCachedResponse(params, new Date(), 'azul');
        if (cached) {
            db.saveRequest('azul', (new Date()).getTime() - startTime, params, null, 200, null);
            res.status(200);
            res.json({results: cached});
            return;
        }

        if (db.checkUnicorn('azul')) {
            console.log('AZUL: ...started UNICORN flow');
            let formattedData = await Unicorn(params, 'azul');
            res.json({results : formattedData});
            db.saveRequest('azul', (new Date()).getTime() - startTime, params, null, 200, formattedData);
            return;
        }

        let azulResponse = await makeRequests(params, startTime, res);

        Formatter.responseFormat(azulResponse.redeemResponse, azulResponse.moneyResponse, params, 'azul').then(function (formattedData) {
            if (formattedData.error) {
                exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                return;
            }

            if (!validator.isFlightAvailable(formattedData)) {
                exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                return;
            }

            res.status(200);
            res.json({results: formattedData});
            db.saveRequest('azul', (new Date()).getTime() - startTime, params, null, 200, formattedData);
        });
    } catch (err) {
        console.log(err);
        exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 400, MESSAGES.CRITICAL, new Date())
    }
}

function makeRequests(params, startTime, res) {
    return Promise.all([getCashResponse(params, startTime, res),getRedeemResponse(params, startTime, res)]).then(function (results) {
        return {moneyResponse: results[0], redeemResponse: results[1]};
    });
}

function getCashResponse(params, startTime, res) {
    let request = Proxy.setupAndRotateRequestLib('request-promise', 'azul');
    let formData = Formatter.formatAzulForm(params, !params.returnDate);
    formData[MODE_PROP] = 'R'; //retrieving money response

    let headers = Formatter.formatAzulHeaders(formData, 'post');

    let cookieJar = request.jar();

    return request.post({url: SEARCH_URL, form: formData, headers: headers, jar: cookieJar}).then(function () {
        console.log('AZUL:  ...got first money info');

        return request.get({
            url: 'https://viajemais.voeazul.com.br/Availability.aspx',
            jar: cookieJar
        }).then(function (body) {
            console.log('AZUL:  ...got second money info');
            return body;

        }).catch(function (err) {
            exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
        })
    }).catch(function (err) {
        exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
    });
}

function getRedeemResponse(params, startTime, res) {
    let request = Proxy.setupAndRotateRequestLib('request-promise', 'azul');
    let formData = Formatter.formatAzulForm(params, !params.returnDate);
    formData[MODE_PROP] = 'TD'; //retrieving redeem response

    let headers = Formatter.formatAzulHeaders(formData, 'post');

    let cookieJar = request.jar();

    if (!formData || formData.hdfSearchCodeArrival1 !== '1N' || formData.hdfSearchCodeDeparture1 !== '1N') {
        exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, null, 404, MESSAGES.NO_AIRPORT, new Date());
        return;
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
            exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 502, MESSAGES.PROXY_ERROR, new Date());
        })
    }).catch(function (err) {
        exception.handle(res, 'azul', (new Date()).getTime() - startTime, params, err, 500, MESSAGES.UNREACHABLE, new Date());
    });
}
