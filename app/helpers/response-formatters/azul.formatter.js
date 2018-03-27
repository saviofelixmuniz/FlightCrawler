/**
 * @author Sávio Muniz
 */

var Time = require('../time-utils');
var Parser = require('../parse-utils');
var CONSTANTS = require('../constants');
var cheerio = require('cheerio');

module.exports = format;

function format(redeemResponse, cashResponse, searchParams) {
    var flights = scrapHTML(cashResponse, redeemResponse, searchParams);
    var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'latam');

    var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;
    var departureDate = new Date(searchParams.departureDate);

    response["Trechos"][goingStretchString] = {
        "Semana" : parseWeek(flights.goingWeek),
        "Voos" : parseJSON(flights.going, true)
    };

    if (searchParams.returnDate) {
        var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;

        response["Trechos"][comingStretchString] = {
            "Semana" : parseWeek(flights.comingWeek),
            "Voos" : parseJSON(flights.coming, false)
        };
    }

    return response;
}
