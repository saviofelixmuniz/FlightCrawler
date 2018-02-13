/**
 * @author Sávio Muniz
 */

const request = require('requestretry');
const Formatter = require('../helpers/format.helper');
const { URL, URLSearchParams } = require('url');

const HOST = 'https://flightavailability-green.smiles.com.br/';
const PATH = 'searchflights';


module.exports = getFlightInfo;

function getFlightInfo(req, res, next) {
    var params = {
        adults : 1,
        children : 0,
        departureDate : '2018-03-05',
        originAirportCode : 'SAO',
        destinationAirportCode : 'BHZ',
        forceCongener : false,
        infants : 0
    };
    res.send(Formatter.urlFormat(HOST, PATH, params));
}
