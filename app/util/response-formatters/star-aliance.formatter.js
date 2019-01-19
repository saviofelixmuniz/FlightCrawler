var CONSTANTS = require('../helpers/constants');
var Time = require('../helpers/time-utils');
const cheerio = require('cheerio');


module.exports = format;

async function format(redeemResponse, jsonCashResponse, searchParams) {
    try {
        var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'star aliance');
        var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;

        if (redeemResponse.going.length === 0) {
            response["Trechos"][goingStretchString] = {'Voos': []};
            return response;
        }

        response["Trechos"][goingStretchString] = {
            "Voos": redeemResponse['going'].map((element)=>formatFlight(element, searchParams))
        };

        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;
            response["Trechos"][comingStretchString] = {
                "Voos": redeemResponse['returning'].map((element)=>formatFlight(element, searchParams))
            };
        }

        //TaxObtainer.resetCacheTaxes('avianca');
        //response.taxes = redeemInfo.taxes;
        return response;
    } catch (e) {
        return {error: e.stack};
    }
}

function formatFlight(flight, searchParams){
    if (flight.miles.length === 0) {
        return
    }

    flightFormatted = {};
    flightFormatted['Companhia'] = 'STAR ALIANCE';
    flightFormatted['Sentido'] = flight.departureAirport === searchParams.originAirportCode ||
    flight.arriveAirport === searchParams.originAirportCode? 'ida' : 'volta';
    flightFormatted['Valor'] = [];
    flightFormatted['Milhas'] = [];
    var beginDate = flight.departureTime;
    var endDate = flight.arriveTime;
    flightFormatted['Embarque'] = beginDate;
    flightFormatted['NumeroConexoes'] = flight.numberConnections;
    flightFormatted['NumeroVoo'] = flight.connectionsFlightNumber[0];
    flightFormatted['Duracao'] = getDuration(beginDate, endDate);
    flightFormatted['Desembarque'] = endDate;
    flightFormatted['Origem'] = flight.departureAirport;
    flightFormatted['Destino'] = flight.arriveAirport;
    flightFormatted['Conexoes'] = [];
    /*if (flightFormatted.numberConnections > 0) {
        flight.connections.forEach(function (segment) {
            var beginDate = new Date(segment.beginDate);
            var endDate = new Date(segment.endDate);
            flightFormatted['Conexoes'].push({
                'NumeroVoo': segment.flightNumber,
                'Duracao': segment.Duracao,
                'Embarque': segment.Embarque,
                'Desembarque': segment.Desembarque,
                'Destino': segment.Destino,
                'Origem': segment.Origem,
            });
        });
    }*/

    //var recFlight = recommendationList[flightIndexInfo.bestRecommendationIndex];


    var redeemObj = {
        'Bebe': 0,
        'Executivo': false,
        'TipoMilhas': 'star aliance',
        //'Crianca': Number(searchParams.children) && flight.miles.length > 0 ?
         //   Math.round(flight.miles[0].miles * CHILD_DISCOUNT) : 0,
        'Adulto': (flight.miles.length > 0) ? flight.miles[0] : null
    };

    /*if (!taxes[redeemPrice[0].uid]) {
        taxes[redeemPrice[0].uid] = {tax: recFlight.bounds.length > 1 ? recFlight.bounds[(coming ? 1 : 0)].boundAmount.tax : recFlight.recoAmount.tax};
    }*/

    if (flightFormatted['Milhas'].length === 0) {
        flightFormatted['Milhas'].push(redeemObj);
        /*if (amigo && redeemPrice && redeemPrice.length > 1) {
            var redeemObj2 = {
                'Bebe': 0,
                'Executivo': searchParams.executive,
                'TipoMilhas': 'amigo',
                'Crianca': Number(searchParams.children) && redeemPrice.length ?
                    Math.round(redeemPrice[1].miles * CHILD_DISCOUNT) : 0,
                'Adulto': redeemPrice[1].miles,
                'id': redeemPrice[1].uid
            };
            flightFormatted['Milhas'].push(redeemObj2);
            if (!taxes[redeemPrice[1].uid]) {
                taxes[redeemPrice[1].uid] = {tax: recFlight.bounds.length > 1 ? recFlight.bounds[(coming ? 1 : 0)].boundAmount.tax : recFlight.recoAmount.tax};
            }
        }*/
    }
    return flightFormatted;
}

function getDuration(start, end) {
    start = start.split(" ");
    let dateStart = start[0].split("/");
    let timeStart = start[1].split(":");
    start = new Date(dateStart[2], dateStart[1]-1, dateStart[0], timeStart[1], timeStart[0]);

    end = end.split(" ");
    let dateEnd = end[0].split("/");
    let timeEnd = end[1].split(":");
    end = new Date(dateEnd[2], dateEnd[1]-1, dateEnd[0], timeEnd[0], timeEnd[1]);

    let duration =  end - start;
    let minutes = parseInt((duration / (1000 * 60)) % 60),
        hours = parseInt((duration / (1000 * 60 * 60)) % 24);

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;

    return hours + ":" + minutes;

}

async function extractInfoFlights(html, searchParams){

}