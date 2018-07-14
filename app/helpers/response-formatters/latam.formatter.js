/**
 * @author Sávio Muniz
 */

var Time = require('../time-utils');
var TaxObtainer = require('../airport-taxes/tax-obtainer');
var CONSTANTS = require('../constants');

module.exports = format;

var params = null;

async function format(redeemResponse, cashResponse, searchParams) {
    try {
        params = searchParams;

        var flights = scrapHTML(cashResponse, redeemResponse, searchParams);

        var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'latam');

        var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;

        response["Trechos"][goingStretchString] = {
            "Semana": {},
            "Voos": await parseJSON(flights.going, searchParams, true)
        };

        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;

            response["Trechos"][comingStretchString] = {
                "Semana": {},
                "Voos": await parseJSON(flights.coming, searchParams, false)
            };
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



function scrapHTML(cashResponse, redeemResponse, searchParams) {
    try {

        var flights = scrapMilesInfo(redeemResponse, searchParams);

        var mileFlights = extractCashInfo(cashResponse, searchParams);

        flights.going.forEach(function (flight) {
            flight.prices = mileFlights.going[flight.code] ? mileFlights.going[flight.code]: {};
        });

        flights.coming.forEach(function (flight) {
            flight.prices = mileFlights.coming[flight.code] ? mileFlights.coming[flight.code]: {};
        });

        flights = deleteFlightsWithNoRedemption(flights);

        return flights;
    } catch (err) {
        throw err;
    }
}

function scrapMilesInfo(cashResponse) {
    try {
        var flights = {going : [], coming : [], goingWeek : {}, comingWeek : {}};

        flights.going = extractMilesInfo(cashResponse.going.data.flights);

        if (Object.keys(cashResponse.returning).length > 0)
            flights.coming = extractMilesInfo(cashResponse.returning.data.flights);

        return flights;
    } catch (err) {
        throw err;
    }
}

function extractMilesInfo(inputFlights) {
    try {
        var outputFlights = [];
        inputFlights.forEach(function (flight) {
            var outputFlight = {};

            outputFlight.code = flight.flightCode;
            outputFlight.number = flight.segments[0].flightCode;
            outputFlight.departureTime = flight.departure.time.stamp;
            outputFlight.departureAirport = flight.departure.airportCode;
            outputFlight.arrivalTime = flight.arrival.time.stamp;
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
                        arrivalAirport : segment.arrival.airportCode,
                        arrivalTime: segment.arrival.time.stamp,
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

function extractCashInfo(redeemResponse) {
    try {
        var mileFlights = {going : {}, coming : {}};

        redeemResponse.going.data.flights.forEach(function (flight) {
            var milePrices = {};
            flight.cabins[0].fares.forEach(function (fare) {
                milePrices[fare.category] = {adult: fare.price.adult.total, child: params.children && params.children > 0? fare.price.child.total : undefined};
            });

            mileFlights.going[flight.flightCode] = milePrices;
        });

        if (Object.keys(redeemResponse.returning).length > 0) {
            redeemResponse.returning.data.flights.forEach(function (flight) {
                var milePrices = {};
                flight.cabins[0].fares.forEach(function (fare) {
                    milePrices[fare.category] = {adult: fare.price.adult.total, child: params.children && params.children > 0? fare.price.child.total : undefined};
                });

                mileFlights.coming[flight.flightCode] = milePrices;
            });
        }

        return mileFlights;
    } catch (err) {
        throw err;
    }
}

async function parseJSON(flights, params, isGoing) {
    try {
        var parsed = [];
        for (var flight of flights) {
            var out = {};
            var dates = Time.getFlightDates(isGoing ? params.departureDate : params.returnDate, flight.departureTime, flight.arrivalTime);
            out.NumeroConexoes = flight.connection && flight.connection.length !== 0 ? flight.connection.length - 1 : 0;
            out.NumeroVoo = flight.number;
            out.Duracao = flight.duration;
            out.Desembarque = dates.arrival + " " + flight.arrivalTime;
            out.Embarque = dates.departure + " " + flight.departureTime;
            out.Origem = flight.departureAirport;
            out.Destino = flight.arrivalAirport;
            out.Conexoes = [];

            if (flight.connection) {
                flight.connection.forEach(function (connection) {
                    var datesConnections = Time.getFlightDates(isGoing ? params.departureDate : params.returnDate, connection.departureTime, connection.arrivalTime);
                    var outConnection = {};
                    outConnection.NumeroVoo = connection.flightNumber;
                    outConnection.Embarque = datesConnections.departure + " " + connection.departureTime;
                    outConnection.Origem = connection.departureAirport;
                    outConnection.Desembarque = datesConnections.arrival + " " + connection.arrivalTime;
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
                    outPrice.TaxaEmbarque = await TaxObtainer.getTax(flight.departureAirport, 'latam', params.originCountry,
                                                                    params.destinationCountry, isGoing);
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