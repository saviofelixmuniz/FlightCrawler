/**
 * @author Sávio Muniz
 */

const request = require('requestretry');
const Formatter = require('../helpers/format.helper');
const Validater = require('../helpers/validater.helper')
const { URL, URLSearchParams } = require('url');
const Keys = require('../configs/keys');

const HOST = 'https://flightavailability-green.smiles.com.br/';
const PATH = 'searchflights';


module.exports = getFlightInfo;

async function getFlightInfo(req, res, next) {
    var validationResult = Validater.validateFlightQuery(req.query);

    if (validationResult.error) {
        res.status(415);
        res.json({error: validationResult.error});
        return;
    }

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

    var result = null;

    await request.get({
        url: Formatter.urlFormat(HOST, PATH, params),
        headers: {
            'x-api-key': Keys.golApiKey
        },
        maxAttempts: 3,
        retryDelay: 150
    })
    .then(function (response) {
        console.log('...got a read');
        result = JSON.parse(response.body);
        return result;
    }, function (error) {
        result = error;
        return result;
    });

    var data = {
        parsed : Formatter.responseFormat(result, null, params, 'gol'),
        classic : result
    }
    res.json(data);
    //res.json(result);
}
