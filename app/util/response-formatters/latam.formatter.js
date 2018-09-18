/**
 * @author Sávio Muniz
 */

var Time = require('../helpers/time-utils');
var TaxObtainer = require('../airports/taxes/tax-obtainer');
var CONSTANTS = require('../helpers/constants');
var mongoose = require('mongoose');

module.exports = format;

async function format(redeemResponse, cashResponse, confiancaResponse, searchParams) {
    try {
        var flights = extractFlights(cashResponse, redeemResponse, searchParams);

        var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'latam');

        var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;

        response["Trechos"][goingStretchString] = {
            "Semana": {},
            "Voos": await parseJSON(flights.going, searchParams, true, flights.taxes)
        };

        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;

            response["Trechos"][comingStretchString] = {
                "Semana": {},
                "Voos": await parseJSON(flights.coming, searchParams, false, flights.taxes)
            };
        }

        if(confiancaResponse.LATAM) {
            for(var trecho in response["Trechos"]) {
                for(var voo in response["Trechos"][trecho].Voos) {
                    let path = response["Trechos"][trecho].Voos[voo].NumeroVoo.substr(2);
                    if( confiancaResponse.LATAM[ response["Trechos"][trecho].Voos[voo].NumeroVoo + response["Trechos"][trecho].Voos[voo].Desembarque.split(' ')[1] ] ) {
                        response["Trechos"][trecho].Voos[voo].Valor = [{
                            "Bebe": 0,
                            "Executivo": false,
                            "Crianca": confiancaResponse.LATAM[ response["Trechos"][trecho].Voos[voo].NumeroVoo + response["Trechos"][trecho].Voos[voo].Desembarque.split(' ')[1] ].child,
                            "Adulto": confiancaResponse.LATAM[ response["Trechos"][trecho].Voos[voo].NumeroVoo + response["Trechos"][trecho].Voos[voo].Desembarque.split(' ')[1] ].adult
                        }]
                    }
                    if( confiancaResponse.LATAM[ path + response["Trechos"][trecho].Voos[voo].Desembarque.split(' ')[1] ] ) {
                        response["Trechos"][trecho].Voos[voo].Valor = [{
                            "Bebe": 0,
                            "Executivo": false,
                            "Tipo": "Pagante",
                            "Crianca": confiancaResponse.LATAM[ path + response["Trechos"][trecho].Voos[voo].Desembarque.split(' ')[1] ].child,
                            "Adulto": confiancaResponse.LATAM[ path + response["Trechos"][trecho].Voos[voo].Desembarque.split(' ')[1] ].adult
                        }]
                    }
                }
            }
        }

        TaxObtainer.resetCacheTaxes('latam');

        return response;
    } catch (err) {
        return {error: err.stack};
    }
}

function deleteFlightsWithNoRedemption(flights) {
    var deleteFlights = function (flights) {
        var auxFlights = [];

        flights.forEach(function (flight) {
            if (flight.milesPrices)
                auxFlights.push(flight)
        });

        return auxFlights;
    };

    flights.going = deleteFlights(flights.going);
    flights.coming = deleteFlights(flights.coming);

    return flights;
}



function extractFlights(cashResponse, redeemResponse, searchParams) {
    try {

        var taxes = {};

        var cashFlights = extractCashInfo(cashResponse, searchParams, taxes);

        var flights = extractMilesInfo(redeemResponse, searchParams);

        flights.taxes = taxes;

        flights.going.forEach(function (flight) {
            flight.prices = cashFlights.going[flight.code] ? cashFlights.going[flight.code]: {};
            for (var milePrice in flight.milesPrices) {
                for (var price in flight.prices) {
                    flight.milesPrices[milePrice].tax = flight.prices[price].tax;
                    break;
                }
            }
        });

        flights.coming.forEach(function (flight) {
            flight.prices = cashFlights.coming[flight.code] ? cashFlights.coming[flight.code]: {};
            for (var milePrice in flight.milesPrices) {
                for (var price in flight.prices) {
                    flight.milesPrices[milePrice].tax = flight.prices[price].tax;
                    break;
                }
            }
        });

        flights = deleteFlightsWithNoRedemption(flights);

        return flights;
    } catch (err) {
        throw err;
    }
}

function extractMilesInfo(rendeemResponse, params) {
    try {
        var flights = {going : [], coming : [], goingWeek : {}, comingWeek : {}};

        debugger;

        flights.going = getInfo(rendeemResponse.going.data.flights, params);

        if (Object.keys(rendeemResponse.returning).length > 0)
            flights.coming = getInfo(rendeemResponse.returning.data.flights, params);

        return flights;
    } catch (err) {
        throw err;
    }
}

function getInfo(inputFlights, params) {
    try {
        var outputFlights = [];
        inputFlights.forEach(function (flight) {
            var outputFlight = {};

            outputFlight.code = flight.flightCode;
            outputFlight.number = flight.segments[0].flightCode;
            outputFlight.departureDate = flight.departure.date;
            outputFlight.departureTime = flight.departure.time.stamp;
            outputFlight.departureDateTime = flight.departure.dateTime;
            outputFlight.departureAirport = flight.departure.airportCode;
            outputFlight.arrivalDate = flight.arrival.date;
            outputFlight.arrivalTime = flight.arrival.time.stamp;
            outputFlight.arrivalDateTime = flight.arrival.dateTime;
            outputFlight.arrivalAirport = flight.arrival.airportCode;

            var duration = flight.flightDuration;

            outputFlight.duration = duration.split('H')[0].split('PT')[1] + ':' + duration.split('H')[1].split('M')[0];
            outputFlight.milesPrices = {};
            outputFlight.taxes = {};
            flight.cabins[0].fares.forEach(function (fare) {
                outputFlight.milesPrices[fare.category] = {adult: fare.price.adult.total, child: params.children && params.children > 0? fare.price.child.total : undefined};
            });

            outputFlight.connection = [];

            if (flight.stops > 0) {
                flight.segments.forEach(function (segment) {
                    var duration = segment.duration;
                    var outConnection = {
                        departureAirport : segment.departure.airportCode,
                        departureTime: segment.departure.time.stamp,
                        departureDate: segment.departure.date,
                        departureDateTime: segment.departure.dateTime,
                        arrivalAirport : segment.arrival.airportCode,
                        arrivalTime: segment.arrival.time.stamp,
                        arrivalDate: segment.arrival.date,
                        arrivalDateTime: segment.arrival.dateTime,
                        flightNumber : segment.flightCode,
                        duration : duration.split('H')[0].split('PT')[1] + ':' + duration.split('H')[1].split('M')[0]
                    };

                    outputFlight.connection.push(outConnection);
                });
            }

            outputFlights.push(outputFlight);
        });

        return outputFlights;
    }
    catch (err) {
        throw err;
    }
}

function extractCashInfo(redeemResponse, params, taxes) {
    try {
        var mileFlights = {going : {}, coming : {}};

        redeemResponse.going.data.flights.forEach(function (flight) {
            var milePrices = {};
            flight.cabins[0].fares.forEach(function (fare) {
                milePrices[fare.category] = {
                    adult: fare.price.adult.amountWithoutTax,
                    child: params.children && params.children > 0? fare.price.child.total : undefined,
                    tax: fare.price.adult.taxAndFees
                };
            });

            if (!taxes[flight.departure.airportCode]) taxes[flight.departure.airportCode] = [];
            taxes[flight.departure.airportCode].push(flight.cabins[0].fares[0].price.adult.taxAndFees);

            mileFlights.going[flight.flightCode] = milePrices;
        });

        if (Object.keys(redeemResponse.returning).length > 0) {
            redeemResponse.returning.data.flights.forEach(function (flight) {
                var milePrices = {};
                flight.cabins[0].fares.forEach(function (fare) {
                    milePrices[fare.category] = {
                        adult: fare.price.adult.amountWithoutTax,
                        child: params.children && params.children > 0? fare.price.child.total : undefined,
                        tax: fare.price.adult.taxAndFees
                    };
                });

                if (!taxes[flight.departure.airportCode]) taxes[flight.departure.airportCode] = [];
                taxes[flight.departure.airportCode].push(flight.cabins[0].fares[0].price.adult.taxAndFees);

                mileFlights.coming[flight.flightCode] = milePrices;
            });
        }

        return mileFlights;
    } catch (err) {
        throw err;
    }
}

async function parseJSON(flights, params, isGoing, taxes) {
    function parseISODate(isoDate) {
        var splitted = isoDate.split('-');
        return `${splitted[2]}/${splitted[1]}/${splitted[0]}`
    }

    try {
        var parsed = [];
        for (var flight of flights) {
            var out = {};
            out._id = mongoose.Types.ObjectId();
            out.NumeroConexoes = flight.connection && flight.connection.length !== 0 ? flight.connection.length - 1 : 0;
            out.NumeroVoo = flight.number;
            out.Duracao = flight.duration;
            out.Desembarque = parseISODate(flight.arrivalDate) + ' ' + flight.arrivalTime;
            out.Embarque = parseISODate(flight.departureDate) + ' ' + flight.departureTime;
            out.Origem = flight.departureAirport;
            out.Destino = flight.arrivalAirport;
            out.Conexoes = [];

            if (flight.connection) {
                flight.connection.forEach(function (connection) {
                    var outConnection = {};
                    outConnection.NumeroVoo = connection.flightNumber;
                    outConnection.Embarque = parseISODate(connection.departureDate) + ' ' +  connection.departureTime;
                    outConnection.Origem = connection.departureAirport;
                    outConnection.Desembarque = parseISODate(connection.arrivalDate) + ' ' +  connection.arrivalTime;
                    outConnection.Destino = connection.arrivalAirport;
                    outConnection.Duracao = connection.duration;

                    out.Conexoes.push(outConnection);
                })
            }

            out.Valor = [];

            Object.keys(flight.prices).forEach(function (keyPrice) {
                var outPrice = {};
                outPrice.Bebe = 0;
                outPrice.Executivo = false;
                outPrice.TipoValor = keyPrice;
                outPrice.Adulto = flight.prices[keyPrice].adult;
                out.Valor.push(outPrice);
            });

            out.Milhas = [];

            if (flight.milesPrices) {
                for (var keyMilePrice of Object.keys(flight.milesPrices)) {
                    var outPrice = {};
                    outPrice.Bebe = 0;
                    outPrice.Executivo = false;
                    outPrice.TipoMilhas = keyMilePrice;
                    outPrice.Adulto = flight.milesPrices[keyMilePrice].adult;
                    outPrice.Crianca = flight.milesPrices[keyMilePrice].child;
                    outPrice.TaxaEmbarque = flight.milesPrices[keyMilePrice].tax ? flight.milesPrices[keyMilePrice].tax :
                        (taxes[flight.departureAirport] ? getMedianTax(taxes[flight.departureAirport]) :
                            await TaxObtainer.getTax(flight.departureAirport, 'latam', params.originCountry, params.destinationCountry, isGoing));
                    out.Milhas.push(outPrice);
                }
            }

            if (isGoing)
                out.Sentido = 'ida';

            else
                out.Sentido = 'volta';

            out.Companhia = 'LATAM';

            parsed.push(out);
        }

        return parsed;
    } catch (err) {
        throw err;
    }
}

function getMedianTax(taxes) {
    var tax = 0;
    if (taxes.length % 2 === 0) {
        tax = (taxes[(taxes.length / 2) - 1] + taxes[(taxes.length / 2)]) / 2
    } else {
        tax = taxes[parseInt(taxes.length / 2)]
    }
    console.log('median tax: ' + tax);
    return tax;
}