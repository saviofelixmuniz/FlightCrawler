/**
 * @author Sávio Muniz
 */

const db = require('../services/db-helper');
const TaxObtainer = require('../airports/taxes/tax-obtainer');
var Time = require('../helpers/time-utils');
var Parser = require('../helpers/parse-utils');
var CONSTANTS = require('../helpers/constants');
var mongoose = require('mongoose');
const Keys = require('../../configs/keys');
const TIME_LIMIT = 10000; // 10s;

module.exports = format;

async function format(jsonRedeemResponse, jsonCashResponse, confiancaResponse, searchParams) {
    try {
        var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'gol');
        var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;
        var departureDate = new Date(searchParams.departureDate);

        var flightsGoing = jsonRedeemResponse["requestedFlightSegmentList"][0]["flightList"];
        flightsGoing = addFlightsCash(flightsGoing, jsonCashResponse, searchParams.departureDate);
        var flightsBack = jsonRedeemResponse["requestedFlightSegmentList"][1]["flightList"];
        flightsBack = addFlightsCash(flightsBack, jsonCashResponse, searchParams.returnDate);


        if (flightsGoing.length === 0 &&
                (searchParams.returnDate && flightsBack.length === 0)) {
            response["Trechos"][goingStretchString] = {"Voos": []};
            return response;
        }

        response["Trechos"][goingStretchString] = {
            "Semana": jsonRedeemResponse["requestedFlightSegmentList"][0].length ?
                formatRedeemWeekPrices(getMin(flightsGoing, departureDate)) : {},
            "Voos": await getFlightList(jsonCashResponse, flightsGoing, true, searchParams)
        };

        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;

            response["Trechos"][comingStretchString] = {
                "Semana": jsonRedeemResponse["requestedFlightSegmentList"][1].length ?
                       formatRedeemWeekPrices(getMin(flightsBack, departureDate)) : {},
                "Voos": await getFlightList(jsonCashResponse, flightsBack, false, searchParams)
            };
        }

        if(confiancaResponse.GOL) {
            for(var trecho in response["Trechos"]) {
                for(var voo in response["Trechos"][trecho].Voos) {
                    if( confiancaResponse.GOL[ response["Trechos"][trecho].Voos[voo].NumeroVoo + response["Trechos"][trecho].Voos[voo].Desembarque.split(' ')[1] ] ) {
                        response["Trechos"][trecho].Voos[voo].Valor = [{
                            "Bebe": 0,
                            "Executivo": false,
                            "Tipo": "Pagante",
                            "Crianca": confiancaResponse.GOL[ response["Trechos"][trecho].Voos[voo].NumeroVoo + response["Trechos"][trecho].Voos[voo].Desembarque.split(' ')[1] ].child,
                            "Adulto": confiancaResponse.GOL[ response["Trechos"][trecho].Voos[voo].NumeroVoo + response["Trechos"][trecho].Voos[voo].Desembarque.split(' ')[1] ].adult
                        }]
                    }
                }
            }
        }

        TaxObtainer.resetCacheTaxes('gol');
        return response;
    } catch (err) {
        return {error: err.stack};
    }
}

async function getFlightList(cash, flightList, isGoing, searchParams) {
    try {
        var output = [];
        for (var flight of flightList) { 
            if (flight.cabin === 'ECONOMIC' && searchParams.executive ||
                flight.cabin === 'BUSINESS' && !searchParams.executive)
                continue;

            var cashInfo = getCashFlightByLegs(cash, flight);
            var flightNumber = (flight["legList"]) ?
                                    flight["legList"][0].operationAirline.code + flight["legList"][0].flightNumber:
                                    flight["CarrierCode"] + flight["Flight"];
            var mil = null;
            if(flight["fareList"]){
                mil = {
                    "Adulto": flight["fareList"][0]["miles"],
                    "id": flight["fareList"][0]["uid"]
                };

                if (searchParams.children > 0) {
                    mil["Crianca"] = flight["fareList"][0]["miles"];
                }
            }

            var flightFormatted = {
                "_id": mongoose.Types.ObjectId(),
                "Desembarque": getDateArrival(flight),
                "NumeroConexoes": getNumberConections(flight),
                "NumeroVoo": flightNumber,
                "Duracao": getDurationFlight(flight),
                "Origem": getDepartureAirport(flight),
                "Embarque": Time.getDateTime(new Date(getDepartureDate(flight))),
                "Destino": getArrivalAirport(flight),
                "Companhia": "GOL",
                "valuesType": 0,
                "isPromotional": false,
                "Sentido": isGoing ? "ida" : "volta",
                "Milhas": (mil) ? [ mil ] : [],
                "Valor": [],
                "id": flight["uid"]
            };

            if (cashInfo)
                Object.keys(cashInfo["Taxes"]).forEach(function (flightType) {
                    if (flightType === 'TXE') return;
                    var val = {
                        "Bebe": 0,
                        "Executivo": false,
                        "Crianca": cashInfo["Taxes"][flightType]["ValueChild"],
                        "Adulto": cashInfo["Taxes"][flightType]["Value"],
                        "TipoValor": cashInfo["Taxes"][flightType]["Name"]
                    };
                    if (!val["Crianca"]) delete val["Crianca"];
                    flightFormatted['Valor'].push(val);
                });

            flightFormatted["Conexoes"] = [];

            if (flightFormatted.NumeroConexoes > 0) {
                var legList = (flight["legList"]) ? flight["legList"] : flight["Segments"];
                legList.forEach(function (connection) {
                    var departureDate = (connection["departure"]) ?
                                        connection["departure"]["date"]: connection["STD"];
                    var departureAirport = (connection["departure"]) ?
                                            connection["departure"]["airport"]["code"]: connection["DepartureAirportCode"];
                    var arrivalDate = (connection["arrival"]) ?
                                        connection["arrival"]["date"]: connection["STA"];
                    var arrivalAirport = (connection["arrival"]) ?
                                        connection["arrival"]["airport"]["code"]: connection["ArrivalAirportCode"];

                    var connectionFormatted = {
                        "NumeroVoo": (connection["flightNumber"]) ? connection["flightNumber"] : connection["FlightNumber"],
                        "Embarque": Time.getDateTime(new Date(departureDate)),
                        "Origem": departureAirport,
                        "Destino": arrivalAirport,
                        "Desembarque": Time.getDateTime(new Date(arrivalDate))
                    };
                    connectionFormatted["Duracao"] = msToTime(new Date(arrivalDate) - new Date(departureDate));

                    flightFormatted["Conexoes"].push(connectionFormatted)
                });
            }
            output.push(flightFormatted)
        }
        return output;
    } catch (e) {
        throw e;
    }
}

function getCashFlightByLegs(cashFlights, flight) {
    if(cashFlights["TripResponses"]){
        if(!flight["legList"] && flight["Taxes"]) return flight;
        var redeemLegs = flight["legList"];
        for (let cashFlight of cashFlights["TripResponses"]) {
            if (cashFlight["Segments"].length === redeemLegs.length) {
                for (let i=0; i < redeemLegs.length; i++) {
                    if (cashFlight["Segments"][i]["Legs"][0]["STA"] == redeemLegs[i]["arrival"]["date"] &&
                        cashFlight["Segments"][i]["Legs"][0]["STD"] == redeemLegs[i]["departure"]["date"] &&
                        cashFlight["Segments"][i]["Legs"][0]["ArrivalAirportCode"] == redeemLegs[i]["arrival"]["airport"]["code"] &&
                        cashFlight["Segments"][i]["Legs"][0]["DepartureAirportCode"] == redeemLegs[i]["departure"]["airport"]["code"]) {
                        if (i == redeemLegs.length - 1) return cashFlight;
                    }
                }
            }
        }
    }
    return null;
}

function getMin(flightList) {
    try {
        var min = flightList[0];

        for (var i = 0; i < flightList.length; i++) {
            if (flightList[i]["fareList"][0]["miles"] < min["fareList"][0]["miles"])
                min = flightList[i]
        }

        return min;
    } catch (e) {
        throw e;
    }
}

function formatRedeemWeekPrices(redeemWeekInfo, date) {
    try {
        var outputData = {};
        outputData[Time.formatDate(date)] = {
            "Milhas": redeemWeekInfo["miles"].toString(),
            "Companhia": "Gol",
            "Valor": redeemWeekInfo["airlineFareAmount"]
        };
        return [outputData];
    } catch (e) {
        throw e;
    }
}

function msToTime(duration) {
    var minutes = parseInt((duration / (1000 * 60)) % 60),
        hours = parseInt((duration / (1000 * 60 * 60)) % 24);

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;

    return hours + ":" + minutes;
}

function addFlightsCash(flightsMiles, cashResponse, departureDate) {
    flightsMiles = flightsMiles || [];
    var flightCash = [];
    for(var flight of cashResponse["TripResponses"]){
        if(flight["DepartureDateTime"].split("T")[0] === departureDate){
            var existedObj = flightsMiles.find((obj)=>{
                var departureArrivalDate = flight["ArrivalDateTime"] == obj["arrival"]["date"] &&
                    flight["DepartureDateTime"] == obj["departure"]["date"];
                var departureAiport = flight["Segments"][0]["DepartureAirportCode"] == obj["departure"]["airport"]["code"];
                return departureAiport && departureArrivalDate;
            })
            if(!existedObj)flightCash.push(flight);
        }
    }
    return flightsMiles.concat(flightCash);
}

function getDateArrival(flight) {
    var date = (flight["arrival"]) ? flight["arrival"]["date"] : flight["ArrivalDateTime"];
    return Time.getDateTime(new Date(date));
}

function getDurationFlight(flight) {
    if(flight["Duration"]) return flight["Duration"];
    return  Parser.parseDigits(flight["duration"]["hours"], 2) + ":" + Parser.parseDigits(flight["duration"]["minutes"], 2);
}

function getNumberConections(flight) {
    return (flight["legList"]) ? flight["legList"].length - 1 : flight["Stops"];
}

function getDepartureAirport(flight) {
    if(flight["departure"]) return flight["departure"]["airport"]["code"];
    return flight["Segments"][0]["DepartureAirportCode"];
}

function getDepartureDate(flight) {
    if(flight["departure"]) return flight["departure"]["date"];
    return flight["Segments"][0]["STD"];
}

function getArrivalAirport(flight) {
    if(flight["departure"]) return flight["arrival"]["airport"]["code"];
    return flight["Segments"][flight["Segments"].length -1]["ArrivalAirportCode"];
}