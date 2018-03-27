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
    var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'azul');

    var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;
    var departureDate = new Date(searchParams.departureDate);

    // response["Trechos"][goingStretchString] = {
    //     "Semana" : parseWeek(flights.goingWeek),
    //     "Voos" : parseJSON(flights.going, true)
    // };
    //
    // if (searchParams.returnDate) {
    //     var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;
    //
    //     response["Trechos"][comingStretchString] = {
    //         "Semana" : parseWeek(flights.comingWeek),
    //         "Voos" : parseJSON(flights.coming, false)
    //     };
    // }

    return response;
}

function scrapHTML(cashResponse, redeemResponse) {
    var $ = cheerio.load(cashResponse);

    var flights = {going : [], coming : [], goingWeek : {}, comingWeek : {}};

    $('tbody','table.tbl-flight-details.tbl-depart-flights').children().each(function () {
        var tr = $(this);

        if (extractTableInfo(tr))
            flights.going.push(extractTableInfo(tr))
    });
}

function extractTableInfo(tr) {
    var flight = {};

    flight.number = tr.children().eq(0).find('button.flight.show-info').find('span').text().split(' Voo ')[1];

    if (!flight.number)
        return undefined;

    var infoButton = tr.children().eq(0)
                            .find('span.bubblehelp.bubblehelp--js').eq(0).
                            find('button');

    var departureTimes = infoButton.attr('departuretime').split(',');
    var arrivalTimes = infoButton.attr('arrivaltime').split(',');
    var origins = infoButton.attr('departure').split(',');
    var destinations = infoButton.attr('arrival').split(',');

    console.log(departureTimes);
    console.log(arrivalTimes);
    console.log(origins);
    console.log(destinations);

    flight.departureTime = departureTimes[0];
    flight.departureAirport = origins[0];
    flight.duration = infoButton.attr('traveltime');
    flight.arrivalTime = arrivalTimes[arrivalTimes.length - 1];
    flight.arrivalAirport = destinations[destinations.length - 1];

    console.log(flight);
    return flight;
}