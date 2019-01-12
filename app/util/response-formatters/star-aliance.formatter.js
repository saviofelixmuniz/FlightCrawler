var CONSTANTS = require('../helpers/constants');

module.exports = format;

async function format(redeemResponse, jsonCashResponse, searchParams) {
    try {
        var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'star aliance');
        var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;
        if (redeemResponse.length === 0) {
            response["Trechos"][goingStretchString] = {'Voos': []};
            return response;
        }

        response["Trechos"][goingStretchString] = {
            "Voos": redeemResponse['going'].forEach(formatFlight(element, searchParams))
        };

        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;
            response["Trechos"][comingStretchString] = {
                "Voos": redeemResponse['returning'].forEach(formatFlight(element, searchParams))
            };
        }

        TaxObtainer.resetCacheTaxes('avianca');
        response.taxes = redeemInfo.taxes;
        return response;
    } catch (e) {
        return {error: e.stack};
    }
}

function formatFlight(flight, searchParams){
    flightFormatted = {};
    flightFormatted['Companhia'] = 'STAR ALIANCE';
    flightFormatted['Sentido'] = flight.departureAirport === searchParams.originAirportCode ||
    flight.arriveAirport === searchParams.originAirportCode? 'ida' : 'volta';
    flightFormatted['Valor'] = [];
    flightFormatted['Milhas'] = [];
    var beginDate = new Date(flight.connections[0].Embarque);
    var endDate = new Date(flight.connections[flight.connections.length - 1].Desembarque);
    flightFormatted['Embarque'] = beginDate;
    flightFormatted['NumeroConexoes'] = flight.numberConnections;
    flightFormatted['NumeroVoo'] = flight.connections[0].flightNumber;
    flightFormatted['Duracao'] = Time.getInterval(endDate.getTime() - beginDate.getTime());
    flightFormatted['Desembarque'] = endDate;
    flightFormatted['Origem'] = flight.connections[0].Origem;
    flightFormatted['Destino'] = flight.connections[flight.connections.length - 1].Destino;
    flightFormatted['Conexoes'] = [];
    if (flightFormatted.numberConnections > 0) {
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
    }

    //var recFlight = recommendationList[flightIndexInfo.bestRecommendationIndex];

    var amigo = true;
    if (flight.miles.length > 0) {
        return
    }

    var redeemObj = {
        'Bebe': 0,
        'Executivo': searchParams.executive,
        'TipoMilhas': 'star aliance',
        //'Crianca': Number(searchParams.children) && flight.miles.length > 0 ?
         //   Math.round(flight.miles[0].miles * CHILD_DISCOUNT) : 0,
        'Adulto': (flight.miles.length > 0) ? flight.miles[0] : null
    };

    if (!taxes[redeemPrice[0].uid]) {
        taxes[redeemPrice[0].uid] = {tax: recFlight.bounds.length > 1 ? recFlight.bounds[(coming ? 1 : 0)].boundAmount.tax : recFlight.recoAmount.tax};
    }

    if (flightFormatted['Milhas'].length === 0 || !amigo) {
        flightFormatted['Milhas'].push(redeemObj);
        if (amigo && redeemPrice && redeemPrice.length > 1) {
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
        }
    }
}