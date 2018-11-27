const TaxObtainer = require('../airports/taxes/tax-obtainer');
var Time = require('../helpers/time-utils');
var Parser = require('../helpers/parse-utils');
var CONSTANTS = require('../helpers/constants');
var cheerio = require('cheerio');
var mongoose = require('mongoose');
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
                availability['recommendationList'], searchParams, availability['cube']['bounds'][0]['fareFamilyList'], redeemInfo.going, false, redeemInfo.taxes)
        };

        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;

            response["Trechos"][comingStretchString] = {
                "Semana": international ? formatRedeemWeekPricesInternational(availability['owdCalendar']['matrix'], true) :
                    formatRedeemWeekPrices(availability['owcCalendars'][1]['array']),
                "Voos": await getFlightList(availability['proposedBounds'][1]['proposedFlightsGroup'],
                    availability['recommendationList'], searchParams, availability['cube']['bounds'][1]['fareFamilyList'], redeemInfo.returning, true, redeemInfo.taxes)
            };
        }

        TaxObtainer.resetCacheTaxes('avianca');
        response.taxes = redeemInfo.taxes;
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

async function getFlightList(flightList, recommendationList, searchParams, fareFamilyList, redeemInfo, coming, taxes) {
    try {
        var flightsFormatted = [];
        for (var fareFamily of fareFamilyList) {
            for (var flightIndexInfo of Object.values(fareFamily.flights)) {
                for (var flight of flightList) {
                    if (flight.proposedBoundId === flightIndexInfo.flight.flightId) {
                        var flightFormatted = {
                            id: flight.proposedBoundId,
                            "_id": mongoose.Types.ObjectId()
                        };

                        var existingFormattedFlight = getFlight(flightsFormatted, flight.proposedBoundId);

                        if(!existingFormattedFlight){
                            formatFlight(flight, flightIndexInfo, recommendationList, redeemInfo, taxes, searchParams, flightFormatted);
                            if(flightFormatted.Milhas.length > 0 || flightFormatted.Valor.length > 0)flightsFormatted.push(flightFormatted);
                        }
                        break;
                    }
                }
            }
        }

        for (var flight of flightsFormatted) {
            delete flight['id'];
        }

        return flightsFormatted;
    } catch (e) {
        throw e;
    }
}

function connectionsObjToString(connections) {
    var result = '';
    for (var conn of connections) {
        result += conn["NumeroVoo"];
    }
    return result;
}

function extractRedeemInfo(htmlRedeemResponse, params) {
    var flights = {going: {}, returning: {}, taxes: {}};

    if(params.executive) return flights;

    var $ = cheerio.load(htmlRedeemResponse);

    var contentScript = htmlRedeemResponse.substring(htmlRedeemResponse.indexOf('var generatedJSon'),
        htmlRedeemResponse.indexOf('var jsonExpression'));
    eval(contentScript);
    var jsonExpression = "(" + generatedJSon + ")";
    var goingJsonObject = eval(jsonExpression);
    var goingFareIndex = 0;

    if (params.returnDate) {
        var contentScript2 = htmlRedeemResponse.substring(htmlRedeemResponse.lastIndexOf('var generatedJSon'),
            htmlRedeemResponse.lastIndexOf('var jsonExpression'));
        eval(contentScript2);
        var jsonExpression2 = "(" + generatedJSon + ")";
        var returningJsonObject = eval(jsonExpression2);
        var returningFareIndex = 0;
    }

    for (id in goingJsonObject.totalPrices) {
        goingJsonObject.totalPrices[id].tax = Parser.parseLocaleStringToNumber(goingJsonObject.totalPrices[id].tax.split('R$ ')[1]);
    }

    flights.taxes = goingJsonObject.totalPrices;

    var tbody = $('tbody','#fpcTableFareFamilyContent_out');
    tbody.children().each(function () {
        var tr = $(this);
        var miles = tr.find('td.col2');
        var miles2 = tr.find('td.col3');
        if (miles.length === 0 && miles2.length === 0)
            return;

        var splitPointsArray = miles.text().split(' Pontos')[0].split('\n');
        miles = Number(splitPointsArray[splitPointsArray.length - 1].trim());

        if (miles2.length > 0) {
            splitPointsArray = miles2.text().split(' Pontos')[0].split('\n');
            miles2 = Number(splitPointsArray[splitPointsArray.length - 1].trim());
        } else {
            miles2 = null;
        }

        var flightInfo = tr.find('.col1').find('.tableFPCFlightDetails').find('tr');
        var connections = extractConnections(flightInfo.eq(0).children().eq(2).text().replace(/\s/g, ''));

        if (!flights.going[connections.join('')])
            flights.going[connections.join('')] = [];
        if (miles) {
            flights.going[connections.join('')].push({miles: miles, uid: goingJsonObject.listRecos[goingFareIndex++].key});
        }
        if (miles2) {
            flights.going[connections.join('')].push({miles: miles2, uid: goingJsonObject.listRecos[goingFareIndex++].key});
        }
    });

    if (params.returnDate) {
        var tbody = $('tbody', '#fpcTableFareFamilyContent_in');
        tbody.children().each(function () {
            var tr = $(this);
            var miles = tr.find('td.col2');
            var miles2 = tr.find('td.col3');
            if (miles.length === 0 && miles2.length === 0)
                return;

            var splitPointsArray = miles.text().split(' Pontos')[0].split('\n');
            miles = Number(splitPointsArray[splitPointsArray.length - 1].trim());

            if (miles2.length > 0) {
                splitPointsArray = miles2.text().split(' Pontos')[0].split('\n');
                miles2 = Number(splitPointsArray[splitPointsArray.length - 1].trim());
            } else {
                miles2 = null;
            }

            var flightInfo = tr.find('.col1').find('.tableFPCFlightDetails').find('tr');
            var connections = extractConnections(flightInfo.eq(0).children().eq(2).text().replace(/\s/g, ''));
            if (!flights.returning[connections.join('')])
                flights.returning[connections.join('')] = [];
            if (miles) flights.returning[connections.join('')].push({miles: miles, uid: returningJsonObject.listRecos[returningFareIndex++].key});
            if (miles2) flights.returning[connections.join('')].push({miles: miles2, uid: returningJsonObject.listRecos[returningFareIndex++].key});
        });
    }
    return flights;
}

function extractConnections(connText) {
    var result = [];
    var getting = false;
    var current = '';

    for (var c of connText) {
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
    for (var flight of flightsFormatted) {
        if (flight['id'] === id) {
            return flight;
        }
    }

    return null;
}

function formatFlight(flight, flightIndexInfo, recommendationList, redeemInfo, taxes, searchParams, flightFormatted){
    flightFormatted['Companhia'] = 'AVIANCA';
    flightFormatted['Sentido'] = flight.segments[0].beginLocation.cityCode === searchParams.originAirportCode ||
        flight.segments[0].beginLocation.locationCode === searchParams.originAirportCode? 'ida' : 'volta';
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
    flightFormatted['Valor'].push(cashObj);

    var redeemPrice = redeemInfo[flightFormatted['Conexoes'].length ? connectionsObjToString(flightFormatted['Conexoes']) : flightFormatted['NumeroVoo']];
    var amigo = true;
    if (!redeemPrice || !redeemPrice.length) {
        return
        /*amigo = false;
        redeemPrice = [];
        redeemPrice.push(recFlight.bounds.length > 1 ? recFlight.bounds[(coming ? 1 : 0)].boundAmount.milesAmount : recFlight.recoAmount.milesAmount);*/
    }

    var redeemObj = {
        'Bebe': 0,
        'Executivo': searchParams.executive,
        'TipoMilhas': 'amigo',
        'Crianca': Number(searchParams.children) && redeemPrice.length ?
            Math.round(redeemPrice[0].miles * CHILD_DISCOUNT) : 0,
        'Adulto': (redeemPrice.length) ? redeemPrice[0].miles : null,
        //'Adulto': redeemPrice.length ? (amigo ? redeemPrice[0].miles : redeemPrice[0]) : null
        'id': redeemPrice[0].uid
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