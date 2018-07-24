/**
 * @author Sávio Muniz
 */

const TaxObtainer = require('../airport-taxes/tax-obtainer');
var Time = require('../time-utils');
var Parser = require('../parse-utils');
var CONSTANTS = require('../constants');
var cheerio = require('cheerio');
const CHILD_DISCOUNT = 0.8;

module.exports = format;

var params = null;

async function format(redeemResponse, cashResponse, searchParams) {
    try {
        params = searchParams;
        var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;
        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;
        }
        var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'azul');
        var flights = scrapHTML(cashResponse, redeemResponse);
        response["Trechos"][goingStretchString] = {
            "Voos": await parseJSON(flights.going, searchParams, true)
        };

        if (searchParams.returnDate) {
            response["Trechos"][comingStretchString] = {
                "Voos": await parseJSON(flights.coming, searchParams, false)
            };
        }

        TaxObtainer.resetCacheTaxes('azul');
        return response;
    } catch (err) {
        console.log(err);
        return { error: err.stack };
    }
}

async function parseJSON(flights, params, isGoing) {
    try {
        var outputFlights = [];
        for (var flight of flights) {
            var dates = Time.getFlightDates(isGoing ? params.departureDate : params.returnDate, flight.departureTime, flight.arrivalTime);
            var outputFlight = {
                'Desembarque': dates.arrival + " " + flight.arrivalTime,
                'NumeroConexoes': flight.connections.length - 1,
                'NumeroVoo': flight.number,
                'Duracao': flight.duration,
                'Origem': flight.departureAirport,
                'Embarque': dates.departure + " " + flight.departureTime,
                'Destino': flight.arrivalAirport,
                'Valor': [],
                'Milhas': [],
                'Sentido': isGoing ? 'ida' : 'volta',
                'Companhia': 'AZUL',
                'valuesType': 0,
                'isPromotional': false
            };

            flight.prices.forEach(price => {
                var cash = {
                    'Bebe': 0,
                    'Executivo': false,
                    'TipoValor': price.id,
                    'Adulto': price.value
                };

                if (cash.Adulto > 0) {
                    if (params.children > 0) {
                        if (cash['TipoValor'] === 'business') {
                            cash['Crianca'] = cash['Adulto'];
                        } else {
                            cash['Crianca'] = (cash['Adulto'] * CHILD_DISCOUNT).toFixed(2);
                        }
                    }

                    outputFlight['Valor'].push(cash);
                }

            });

            for (var redeem of flight.redeemPrice) {
                if (Parser.isNumber(redeem.price)) {
                    var mil = {
                        'Bebe': 0,
                        'Executivo': false,
                        'TaxaAdulto': 0,
                        'TipoMilhas': redeem.id,
                        'TaxaBebe': 0,
                        'Adulto': Parser.parseLocaleStringToNumber(redeem.price),
                        'TaxaEmbarque': await TaxObtainer.getTax(flight.departureAirport, 'azul', params.originCountry,
                                                                 params.destinationCountry, isGoing)
                    };
                    if (mil.Adulto > 0) {
                        if (params.children > 0) {
                            mil['TaxaCrianca'] = 0;
                            if (mil['TipoMilhas'] === 'business') {
                                mil['Crianca'] = mil['Adulto'];
                            } else {
                                mil['Crianca'] = Math.round(mil['Adulto'] * CHILD_DISCOUNT);
                            }
                        }
                        outputFlight['Milhas'].push(mil);
                    }
                }
            }

            if (outputFlight['Milhas'].length < 1) {
                return;
            }

            outputFlight.Conexoes = [];

            if (flight.connections.length > 1) {
                flight.connections.forEach(function (connection) {
                    var departureDate = Time.getFlightDates(params.departureDate, flight.departureTime, connection.departure).arrival;
                    var arrivalDate = Time.getFlightDates(`${departureDate.split('/')[2]}-${departureDate.split('/')[1]}-${departureDate.split('/')[0]}`, connection.departure, connection.arrival).arrival;
                    var outputConnection = {
                        'NumeroVoo': connection.number,
                        'Duracao': connection.duration,
                        'Embarque': departureDate + " " + connection.departure,
                        'Destino': connection.destination,
                        'Origem': connection.origin,
                        'Desembarque': arrivalDate + " " + connection.arrival
                    };

                    outputFlight.Conexoes.push(outputConnection);
                });
            }

            outputFlights.push(outputFlight);
        }

        return outputFlights;
    } catch (err) {
        throw err;
    }
}

function scrapHTML(cashResponse, redeemResponse) {
    try {
        var $ = cheerio.load(cashResponse);

        var flights = { going: [], coming: [], goingWeek: {}, comingWeek: {} };

        var tableChildren = [];
        $('tbody', 'table.tbl-flight-details.tbl-depart-flights').children().each(function () {
            tableChildren.push($(this));
        });

        for (let child of tableChildren) {
            var goingInfo = extractTableInfo(child);

            if (goingInfo)
                flights.going.push(goingInfo)
        }

        tableChildren = [];

        $('tbody', 'table.tbl-flight-details.tbl-return-flights').children().each(function () {
            tableChildren.push($(this));
        });

        for (let child of tableChildren) {
            var returningInfo = extractTableInfo(child);

            if (returningInfo)
                flights.coming.push(returningInfo)
        }

        $ = cheerio.load(redeemResponse);

        var itRedeem = 0;

        $('tbody', 'table.tbl-flight-details.tbl-depart-flights').children().each(function () {
            var tr = $(this);

            var goingRedeemInfo = extractRedeemInfo(tr, flights);
            if (goingRedeemInfo) {
                flights.going[itRedeem].redeemPrice = goingRedeemInfo;
            }
            itRedeem++;
        });

        itRedeem = 0;

        $('tbody', 'table.tbl-flight-details.tbl-return-flights').children().each(function () {
            var tr = $(this);

            var goingRedeemInfo = extractRedeemInfo(tr, flights);
            if (goingRedeemInfo) {
                flights.coming[itRedeem].redeemPrice = goingRedeemInfo;
                itRedeem++;

            }
        });


        return flights;
    } catch (err) {
        throw err;
    }

}

function extractTableInfo(tr) {
    try {
        var flight = {};
        var price1 = tr.children().eq(1).find('.fare-price').text();
        var price2 = tr.children().eq(2).find('.fare-price').text();
        if (!price1 && !price2) {
            price1 = '0';
        }

        if (Parser.isNumber(price1) || Parser.isNumber(price2)) {
            var infoButton = tr.children().eq(0)
                .find('span.bubblehelp.bubblehelp--js').eq(0).find('button');

            var departureTimes = infoButton.attr('departuretime').split(',');
            var arrivalTimes = infoButton.attr('arrivaltime').split(',');
            var origins = infoButton.attr('departure').split(',');
            var destinations = infoButton.attr('arrival').split(',');
            var flightNumbers = infoButton.attr('flightnumber').split(',');

            var duration = infoButton.attr('traveltime').split(':');
            flight.number = flightNumbers[0];
            flight.departureTime = departureTimes[0];
            flight.departureAirport = origins[0];
            flight.duration = `${Number(duration[0]) < 10 ? '0': ''}${duration[0]}:${Number(duration[1]) < 10 ? '0': ''}${duration[1]}`;
            flight.arrivalTime = arrivalTimes[arrivalTimes.length - 1];
            flight.arrivalAirport = destinations[destinations.length - 1];

            flight.connections = [];

            for (var i = 0; i < departureTimes.length; i++) {
                var leg = {};

                leg.number = flightNumbers[i];
                leg.departure = departureTimes[i];
                leg.arrival = arrivalTimes[i];
                leg.origin = origins[i];
                leg.destination = destinations[i];

                var departureDate = Parser.parseStringTimeToDate(leg.departure);
                var arrivalDate = Parser.parseStringTimeToDate(leg.arrival);

                if (arrivalDate < departureDate) {
                    arrivalDate.setDate(arrivalDate.getDate() + 1);
                }
                leg.duration = Time.getInterval(arrivalDate.getTime() - departureDate.getTime());

                flight.connections.push(leg);
            }

            if (Parser.isNumber(price1) && !Parser.isNumber(price2)) {
                flight.prices = [
                    {
                        id: params.international ? 'economy' : 'flex',
                        value: Parser.parseLocaleStringToNumber(tr.children().eq(1).find('.fare-price').text()),
                        purchaseCode: tr.children().eq(1).find('input').attr('value')
                    },
                ];
            }
            else if (!Parser.isNumber(price1) && Parser.isNumber(price2)) {
                flight.prices = [
                    {
                        id: params.international ? 'business' : 'promo',
                        value: Parser.parseLocaleStringToNumber(tr.children().eq(2).find('.fare-price').text()),
                        purchaseCode: tr.children().eq(1).find('input').attr('value')
                    }
                ];
            } else {
                flight.prices = [
                    {
                        id: params.international ? 'economy' : 'flex',
                        value: Parser.parseLocaleStringToNumber(tr.children().eq(1).find('.fare-price').text()),
                        purchaseCode: tr.children().eq(1).find('input').attr('value')
                    },
                    {
                        id: params.international ? 'business' : 'promo',
                        value: Parser.parseLocaleStringToNumber(tr.children().eq(2).find('.fare-price').text()),
                        purchaseCode: tr.children().eq(1).find('input').attr('value')
                    }
                ];
            }

            return flight;
        }
    } catch (err) {
        throw err;
    }

}

function extractRedeemInfo(tr) {
    try {
        var redeem1 = tr.children().eq(1).find('.fare-price').eq(0).text();
        var redeem2 = tr.children().eq(2).find('.fare-price').eq(0).text();
        var miles;
        if (!redeem1 && !redeem2) {
            miles = [{ id: params.international ? 'economy' : 'tudoazul', price: '0' }];
            return miles;
        }

        miles = [{ id: params.international ? 'economy' : 'tudoazul', price: redeem1 }];
        if (params.international) {
            miles.push({ id: 'business', price: redeem2 });
        }
        return miles;
    }

    catch (err) {
        throw err;
    }
}