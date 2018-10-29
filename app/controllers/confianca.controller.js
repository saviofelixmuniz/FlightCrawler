/**
 * @author Sávio Muniz
 */

const errorSolver = require("../util/helpers/error-solver");
var Confianca = require('../util/helpers/confianca-crawler');

module.exports = getFlightInfo;

async function getFlightInfo(req, res, next) {
    const startTime = (new Date()).getTime();

    console.log('Searching Confianca...');
    try {

        var params = {
            IP: req.clientIp,
            client: req.clientName || "",
            api_key: req.headers['authorization'],
            adults: req.query.adults,
            children: req.query.children ? req.query.children : '0',
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate ? req.query.returnDate : null,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            forceCongener: 'false',
            executive: req.query.executive === 'true',
            originCountry: req.query.originCountry || 'BR',
            destinationCountry: req.query.destinationCountry || 'BR',
            infants: 0,
            confianca: true,
            default_json: true
        };

        var confiancaResponse = await makeRequests(params, startTime, res);

        res.status(200);
        res.json({results: confiancaResponse});

    } catch (err) {
        console.log(err)
        // errorSolver.solveFlightInfoErrors('confianca', err, res, startTime, params);
        res.status(500);
        res.send('confianca');
    }
}

function makeRequests(params, startTime, res) {
    return Promise.all([getConfiancaResponse(params, startTime, res)]).then(function (results) {
        if (results[0].err) {
            throw {err : true, code : results[0].code, message : results[0].message, stack : results[0].stack};
        }
        return results[0];
    });
}

function getConfiancaResponse(params, startTime, res) {
    return Confianca(params);
}