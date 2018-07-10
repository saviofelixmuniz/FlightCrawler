const TaxObtainer = require('../airport-taxes/tax-obtainer');
var Time = require('../time-utils');
var Parser = require('../parse-utils');
var CONSTANTS = require('../constants');
const CHILD_DISCOUNT = 0.751;

module.exports = format;

async function format(jsonRedeemResponse, jsonCashResponse, searchParams) {
    try {
        var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'avianca');
        var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;
        var availability = jsonRedeemResponse['pageDefinitionConfig']['pageData']['business']['Availability'];
        if (!availability || !availability['proposedBounds']) {
            response["Trechos"][goingStretchString] = {'Voos': []};
            return response;
        }

        var international = availability['owdCalendar'];

        response["Trechos"][goingStretchString] = {
            "Semana": international ? formatRedeemWeekPricesInternational(availability['owdCalendar']['matrix']) :
                formatRedeemWeekPrices(availability['owcCalendars'][0]['array']),
            "Voos": await getFlightList(availability['proposedBounds'][0]['proposedFlightsGroup'],
                availability['recommendationList'], searchParams, availability['cube']['bounds'][0]['fareFamilyList'])
        };

        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;

            response["Trechos"][comingStretchString] = {
                "Semana": international ? formatRedeemWeekPricesInternational(availability['owdCalendar']['matrix'], true) :
                    formatRedeemWeekPrices(availability['owcCalendars'][1]['array']),
                "Voos": await getFlightList(availability['proposedBounds'][1]['proposedFlightsGroup'],
                    availability['recommendationList'], searchParams, availability['cube']['bounds'][1]['fareFamilyList'], true)
            };
        }

        TaxObtainer.resetCacheTaxes('avianca');
        return response;
    } catch (e) {
        return {error: e.stack};
    }
}

function formatRedeemWeekPrices(response) {
    try {
        var output = {};
        response.forEach(function (flight) {
            var date = new Date(flight.boundDate);
            var formarttedDate = Time.formatDate(date);
            var flightJSON = {};
            flightJSON['Milhas'] = flight['boundPrice'] ? flight['boundPrice']['milesAmount'] : undefined;
            flightJSON['Valor'] = flight['boundPrice'] ? flight['boundPrice']['totalAmount'] : undefined;
            flightJSON['Companhia'] = 'AVIANCA';
            output[formarttedDate] = flightJSON;
        });
        return output;
    } catch (e) {
        throw e;
    }
}

function formatRedeemWeekPricesInternational(matrix, coming) {
    try {
        var output = {};
        if (!coming) {
            matrix.forEach(function (comb) {
                if (comb[0]['outboundPrice']) {
                    var date = new Date(comb[0].outboundDate);
                    var formattedDate = Time.formatDate(date);
                    var flightJSON = {};
                    flightJSON['Milhas'] = comb[0]['outboundPrice']['milesAmount'];
                    flightJSON['Valor'] = comb[0]['outboundPrice']['amount'];
                    flightJSON['Companhia'] = 'AVIANCA';
                    output[formattedDate] = flightJSON;
                }
            });
        } else {
            matrix[0].forEach(function (comb) {
                if (comb['inboundPrice']) {
                    var date = new Date(comb.inboundDate);
                    var formattedDate = Time.formatDate(date);
                    var flightJSON = {};
                    flightJSON['Milhas'] = comb['inboundPrice']['milesAmount'];
                    flightJSON['Valor'] = comb['inboundPrice']['amount'];
                    flightJSON['Companhia'] = 'AVIANCA';
                    output[formattedDate] = flightJSON;
                }
            });
        }
        return output;
    } catch (e) {
        throw e;
    }
}

async function getFlightList(flightList, recommendationList, searchParams, fareFamilyList, coming) {
    try {
        var flightsFormatted = [];
        for (let fareFamily of fareFamilyList) {
            for (let flightIndexInfo of Object.values(fareFamily.flights)) {
                for (let flight of flightList) {
                    if (flight.proposedBoundId === flightIndexInfo.flight.flightId) {
                        var flightFormatted = {
                            id: flight.proposedBoundId
                        };
                        var existingFormattedFlight = getFlight(flightsFormatted, flight.proposedBoundId);

                        if (!existingFormattedFlight) {
                            flightFormatted['Valor'] = [];
                            flightFormatted['Milhas'] = [];
                            var beginDate = new Date(flight.segments[0].beginDate);
                            var endDate = new Date(flight.segments[flight.segments.length - 1].endDate);
                            flightFormatted['Embarque'] = Time.getDateTime(new Date(flight.segments[0].beginDate));
                            flightFormatted['NumeroConexoes'] = flight.segments.length - 1;
                            flightFormatted['NumeroVoo'] = flight.segments[0].flightNumber;
                            flightFormatted['Duracao'] = Time.getInterval(endDate.getTime() - beginDate.getTime());
                            flightFormatted['Desembarque'] = Time.getDateTime(new Date(flight.segments[flight.segments.length - 1].endDate));
                            flightFormatted['Origem'] = flight.segments[0].beginLocation.locationCode;
                            flightFormatted['Destino'] = flight.segments[flight.segments.length - 1].endLocation.locationCode;
                            flightFormatted['Conexoes'] = [];

                            if (flightFormatted.NumeroConexoes > 0) {
                                flight.segments.forEach(function (segment) {
                                    var beginDate = new Date(segment.beginDate);
                                    var endDate = new Date(segment.endDate);
                                    flightFormatted['Conexoes'].push({
                                        'NumeroVoo': segment.flightNumber,
                                        'Duracao': Time.getInterval(endDate.getTime() - beginDate.getTime()),
                                        'Embarque': Time.getDateTime(new Date(segment.beginDate)),
                                        'Desembarque': Time.getDateTime(new Date(segment.endDate)),
                                        'Destino': segment.endLocation.locationCode,
                                        'Origem': segment.beginLocation.locationCode,
                                    });
                                });
                            }
                        } else {
                            flightFormatted = existingFormattedFlight;
                        }

                        var recFlight = recommendationList[flightIndexInfo.bestRecommendationIndex];
                        var cashObj = {
                            'Bebe': 0,
                            'Executivo': searchParams.executive,
                            'TipoValor': recFlight.bounds.length > 1 ? recFlight.bounds[(coming ? 1 : 0)].ffCode : recFlight.ffCode,
                            'Crianca': searchParams.children ? (recFlight.bounds.length > 1 ?
                                parseFloat((recFlight.bounds[(coming ? 1 : 0)].boundAmount.amountWithoutTax * CHILD_DISCOUNT).toFixed(2)) :
                                parseFloat((recFlight.recoAmount.amountWithoutTax * CHILD_DISCOUNT).toFixed(2))) : 0,
                            'TaxaEmbarque': await TaxObtainer.getTax(flight.segments[0].beginLocation.locationCode, 'avianca'),
                            'Adulto': recFlight.bounds.length > 1 ? recFlight.bounds[(coming ? 1 : 0)].boundAmount.amountWithoutTax : recFlight.recoAmount.amountWithoutTax
                        };

                        var redeemObj = {
                            'Bebe': 0,
                            'Executivo': searchParams.executive,
                            'TipoMilhas': 'amigo',
                            'Crianca': searchParams.children ?
                                (recFlight.bounds.length > 1 ? Math.round(recFlight.bounds[(coming ? 1 : 0)].boundAmount.milesAmount * CHILD_DISCOUNT) :
                                    Math.round(recFlight.recoAmount.milesAmount * CHILD_DISCOUNT)) : 0,
                            'TaxaEmbarque': await TaxObtainer.getTax(flight.segments[0].beginLocation.locationCode, 'avianca'),
                            'Adulto': recFlight.bounds.length > 1 ? recFlight.bounds[(coming ? 1 : 0)].boundAmount.milesAmount : recFlight.recoAmount.milesAmount
                        };

                        flightFormatted['Valor'].push(cashObj);
                        flightFormatted['Milhas'].push(redeemObj);

                        if (!existingFormattedFlight) {
                            flightFormatted['Companhia'] = 'AVIANCA';
                            flightFormatted['Sentido'] = flight.segments[0].beginLocation.cityCode === searchParams.originAirportCode ? 'ida' : 'volta';
                            flightsFormatted.push(flightFormatted);
                        }
                        break;
                    }
                }
            }
        }

        for (let flight of flightsFormatted) {
            delete flight['id'];
        }

        return flightsFormatted;
    } catch (e) {
        throw e;
    }
}

function getFlight(flightsFormatted, id) {
    for (let flight of flightsFormatted) {
        if (flight['id'] === id) {
            return flight;
        }
    }

    return null;
}