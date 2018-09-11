/**
 * @author Sávio Muniz
 */

const TaxObtainer = require('../airports/taxes/tax-obtainer');

var mongoose = require('mongoose');
var Time = require('../helpers/time-utils');
var Parser = require('../helpers/parse-utils');
var CONSTANTS = require('../helpers/constants');
var cheerio = require('cheerio');
const CHILD_DISCOUNT = 0.8;

module.exports = format;

async function format(redeemResponse, cashResponse, confiancaResponse, searchParams) {
    try {
        var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;
        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;
        }
        var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'azul');

        response["Trechos"][goingStretchString] = {
            "Voos": await parseJSON(redeemResponse, cashResponse, searchParams, true)
        };

        if (searchParams.returnDate) {
            response["Trechos"][comingStretchString] = {
                "Voos": await parseJSON(redeemResponse, cashResponse, searchParams, false)
            };
        }

        if(confiancaResponse.AZUL) {
            for(var trecho in response["Trechos"]) {
                for(var voo in response["Trechos"][trecho].Voos) {
                    if( confiancaResponse.AZUL[ response["Trechos"][trecho].Voos[voo].NumeroVoo + response["Trechos"][trecho].Voos[voo].Desembarque.split(' ')[1] ] ) {
                        response["Trechos"][trecho].Voos[voo].Valor = [{
                            "Bebe": 0,
                            "Tipo": "Pagante",
                            "Executivo": false,
                            "Crianca": confiancaResponse.AZUL[ response["Trechos"][trecho].Voos[voo].NumeroVoo + response["Trechos"][trecho].Voos[voo].Desembarque.split(' ')[1] ].child,
                            "Adulto": confiancaResponse.AZUL[ response["Trechos"][trecho].Voos[voo].NumeroVoo + response["Trechos"][trecho].Voos[voo].Desembarque.split(' ')[1] ].adult
                        }]
                    }
                }
            }
        }

        TaxObtainer.resetCacheTaxes('azul');
        return response;
    } catch (err) {
        console.log(err);
        return { error: err.stack };
    }
}

async function parseJSON(redeemResponse, cashResponse, params, isGoing) {
    function formatDate(isoDate) {
        var date = isoDate.split('T')[0].split('-');
        var time = isoDate.split('T')[1].split(':');

        return `${date[2]}/${date[1]}/${date[0]} ${time[0]}:${time[1]}`
    }

    function parseDuration(time) {
        var hours = Number(time.split('h')[0]);
        var minutes = time.split('h')[1].split('min')[0];
        return `${hours <= 9 ? "0"+hours : hours}:${minutes}`
    }

    try {
        var cashInfo = mapCashInfo(cashResponse, isGoing, Number(params.children) > 0, params.executive);

        var flights = redeemResponse["Schedule"]["ArrayOfJourneyDateMarket"][0]["JourneyDateMarket"][isGoing? 0 : 1]["Journeys"]["Journey"];

        var outFlights = [];
        for (var flight of flights) {
            var segments = flight["Segments"]["Segment"];
            var flightNumber = segments[0]["FlightDesignator"]["CarrierCode"] + segments[0]["FlightDesignator"]["FlightNumber"];
            var arrival = segments[segments.length - 1]["STA"];

            var outFlight = {
                "_id": mongoose.Types.ObjectId(),
                "Embarque": formatDate(segments[0]["STD"]),
                "Desembarque": formatDate(arrival),
                "NumeroConexoes": flight["SegmentsCount"] > 1 ? flight["SegmentsCount"] - 1: 0,
                "Duracao": parseDuration(flight["TravelTime"]),
                "NumeroVoo": flightNumber,
                "Origem": segments[0]["DepartureStation"],
                "Destino": segments[segments.length - 1]["ArrivalStation"],
                "Sentido": isGoing ? 'ida': 'volta',
                "Companhia": "AZUL"
            };

            var legs = undefined;
            if (flight["SegmentsCount"] > 1) {
                var legs = [];
                for (var segment of segments) {
                    var departureDate = segment["STD"].split('T')[0].split('-');
                    var arrivalDate = segment["STA"].split('T')[0].split('-');
                    var outLeg = {
                        "NumeroVoo": segment["FlightDesignator"]["CarrierCode"] + segment["FlightDesignator"]["FlightNumber"],
                        "Duracao": parseDuration(segment["Legs"]["Leg"][0]["TravelTime"]),
                        "Embarque": `${departureDate[2]}/${departureDate[1]}/${departureDate[0]} ${segment["STD"].split('T')[1].slice(0,5)}`,
                        "Desembarque": `${arrivalDate[2]}/${arrivalDate[1]}/${arrivalDate[0]} ${segment["STA"].split('T')[1].slice(0,5)}`,
                        "Origem": segment["DepartureStation"],
                        "Destino": segment["ArrivalStation"]
                    };
                    legs.push(outLeg);
                }
            }

            outFlight["Conexoes"] = legs || [];

            var tax = null;
            for (var value of segments[0]["Fares"]["Fare"][0]["PaxFares"]["PaxFare"][0]["ServiceCharges"]["BookingServiceCharge"]) {
                if (value["ChargeType"] === "Tax") {
                    tax = params.originCountry !== params.destinationCountry ? value["ForeignAmount"]: value["Amount"];
                }
            }

            var fare = null;
            if (params.originCountry !== params.destinationCountry) {
                for (var itFare of segments[0]["Fares"]["Fare"]) {
                    if((params.executive ? itFare["ProductClass"] !== "AY":
                        (itFare["ProductClass"] === "AY" || itFare["ProductClass"] === "TE" || itFare["ProductClass"] === "TP")) &&
                        itFare["LoyaltyAmounts"] && itFare["LoyaltyAmounts"].length > 0){
                        fare = itFare;
                    }
                }
            }

            else {
                fare = segments[0]["Fares"]["Fare"][0]
            }

            var miles = {
                "TipoMilhas": "tudoazul",
                "Adulto": fare["LoyaltyAmounts"][0]["Points"],
                "TaxaEmbarque": tax,
            };

            if (Number(params.children) > 0) {
                miles["Crianca"] = fare["LoyaltyAmounts"][0]["PointsCHD"]
            }

            outFlight["Milhas"] = [miles];

            var flightCash = cashInfo[flightNumber + arrival];

            if (flightCash) {
                outFlight["Valor"] = [{
                    "TaxaEmbarque": tax,
                    "Adulto": flightCash.adt,
                    "Crianca": flightCash.chd
                }];
            }

            else
                outFlight["Valor"] = [];


            outFlights.push(outFlight);
        }

        return outFlights;

    } catch (err) {
        throw err;
    }
}

function mapCashInfo(cashResponse, isGoing, children, business) {
    var cashInfo = {};
    if (!cashResponse["Schedules"][isGoing? 0: 1].length) return cashInfo;
    var flights = cashResponse["Schedules"][isGoing? 0: 1][0]["Journeys"];
    for (var flight of flights) {
        var segments = flight["Segments"];
        var flightNumber = segments[0]["FlightDesignator"]["CarrierCode"] + segments[0]["FlightDesignator"]["FlightNumber"];
        var arrival = segments[segments.length - 1]["STA"];

        if (!segments[0]["Fares"][0])
            continue;

        cashInfo[`${flightNumber + arrival}`] = {adt: segments[0]["Fares"][business ? 1:0]["PaxFares"][0]["InternalServiceCharges"][0]["Amount"]};

        if (children) {
            cashInfo[`${flightNumber + arrival}`].chd = segments[0]["Fares"][business? 1:0]["PaxFares"][1]["InternalServiceCharges"][0]["Amount"];
        }
    }

    return cashInfo;
}