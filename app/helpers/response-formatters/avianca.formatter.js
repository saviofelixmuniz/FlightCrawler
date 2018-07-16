const TaxObtainer = require('../airport-taxes/tax-obtainer');
var Time = require('../time-utils');
var Parser = require('../parse-utils');
var CONSTANTS = require('../constants');
var cheerio = require('cheerio');
const CHILD_DISCOUNT = 0.751;

module.exports = format;

async function format(htmlRedeemResponse, jsonCashResponse, searchParams) {
    try {
        var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'avianca');
        var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;
        var availability = jsonCashResponse['pageDefinitionConfig']['pageData']['business']['Availability'];
        if (!availability || !availability['proposedBounds']) {
            response["Trechos"][goingStretchString] = {'Voos': []};
            return response;
        }

        var international = availability['owdCalendar'];

        var redeemInfo = extractRedeemInfo(htmlRedeemResponse, searchParams);

        response["Trechos"][goingStretchString] = {
            "Semana": international ? formatRedeemWeekPricesInternational(availability['owdCalendar']['matrix']) :
                formatRedeemWeekPrices(availability['owcCalendars'][0]['array']),
            "Voos": await getFlightList(availability['proposedBounds'][0]['proposedFlightsGroup'],
                availability['recommendationList'], searchParams, availability['cube']['bounds'][0]['fareFamilyList'], redeemInfo.going)
        };

        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;

            response["Trechos"][comingStretchString] = {
                "Semana": international ? formatRedeemWeekPricesInternational(availability['owdCalendar']['matrix'], true) :
                    formatRedeemWeekPrices(availability['owcCalendars'][1]['array']),
                "Voos": await getFlightList(availability['proposedBounds'][1]['proposedFlightsGroup'],
                    availability['recommendationList'], searchParams, availability['cube']['bounds'][1]['fareFamilyList'], redeemInfo.returning, true)
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

async function getFlightList(flightList, recommendationList, searchParams, fareFamilyList, redeemInfo, coming) {
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
                            flightFormatted['NumeroVoo'] = flight.segments[0].airline.code + flight.segments[0].flightNumber;
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
                                        'NumeroVoo': segment.airline.code + segment.flightNumber,
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
                            'Adulto': recFlight.bounds.length > 1 ? recFlight.bounds[(coming ? 1 : 0)].boundAmount.amountWithoutTax : recFlight.recoAmount.amountWithoutTax
                        };

                        var redeemPrice = redeemInfo[flightFormatted['Conexoes'].length ? connectionsObjToString(flightFormatted['Conexoes']) : flightFormatted['NumeroVoo']];
                        var amigo = true;
                        if (!redeemPrice) {
                            amigo = false;
                            redeemPrice = recFlight.bounds.length > 1 ? recFlight.bounds[(coming ? 1 : 0)].boundAmount.milesAmount : recFlight.recoAmount.milesAmount;
                        }

                        var redeemObj = {
                            'Bebe': 0,
                            'Executivo': searchParams.executive,
                            'TipoMilhas': 'amigo',
                            'Crianca': Number(searchParams.children) && redeemPrice ?
                                Math.round(redeemPrice * CHILD_DISCOUNT) : 0,
                            'TaxaEmbarque': await TaxObtainer.getTax(flight.segments[0].beginLocation.locationCode, 'avianca', searchParams.originCountry, searchParams.destinationCountry, !coming),
                            'Adulto': redeemPrice ? redeemPrice : 0
                        };

                        flightFormatted['Valor'].push(cashObj);
                        if (flightFormatted['Milhas'].length === 0 || !amigo) {
                            flightFormatted['Milhas'].push(redeemObj);
                        }

                        if (!existingFormattedFlight && redeemPrice) {
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

function connectionsObjToString(connections) {
    var result = '';
    for (let conn of connections) {
        result += conn["NumeroVoo"];
    }
    return result;
}

function extractRedeemInfo(htmlRedeemResponse, params) {
    var $ = cheerio.load(htmlRedeemResponse);

    var flights = {going: {}, returning: {}};

    var tbody = $('tbody','#fpcTableFareFamilyContent_out');
    tbody.children().each(function () {
        var tr = $(this);
        var miles = tr.find('td.col2');
        if (miles.length === 0)
            return;

        var splitPointsArray = miles.text().split(' Pontos')[0].split('\n');
        miles = Number(splitPointsArray[splitPointsArray.length - 1].trim());

        var flightInfo = tr.find('.col1').find('.tableFPCFlightDetails').find('tr');
        var connections = extractConnections(flightInfo.eq(0).children().eq(2).text().replace(/\s/g, ''));
        flights.going[connections.join('')] = miles;
    });

    if (params.returnDate) {
        var tbody = $('tbody', '#fpcTableFareFamilyContent_in');
        tbody.children().each(function () {
            var tr = $(this);
            var miles = tr.find('td.col2');
            if (miles.length === 0)
                return;

            var splitPointsArray = miles.text().split(' Pontos')[0].split('\n');
            miles = Number(splitPointsArray[splitPointsArray.length - 1].trim());

            var flightInfo = tr.find('.col1').find('.tableFPCFlightDetails').find('tr');
            var connections = extractConnections(flightInfo.eq(0).children().eq(2).text().replace(/\s/g, ''));
            flights.returning[connections.join('')] = miles;
        });
    }

    return flights;
}

function extractConnections(connText) {
    var result = [];
    var getting = false;
    var current = '';

    for (let c of connText) {
        if (c === '(') {
            getting = true;
            continue;
        }
        if (c === ')') {
            getting = false;
            result.push(current);
            current = '';
            continue;
        }
        if (getting) {
            current += c;
        }
    }

    return result;
}

function getFlight(flightsFormatted, id) {
    for (let flight of flightsFormatted) {
        if (flight['id'] === id) {
            return flight;
        }
    }

    return null;
}