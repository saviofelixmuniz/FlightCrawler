/**
 * @author Sávio Muniz
 */

const db = require('../services/db-helper');
const TaxObtainer = require('../airports/taxes/tax-obtainer');
var Time = require('../helpers/time-utils');
var Parser = require('../helpers/parse-utils');
var CONSTANTS = require('../helpers/constants');
var cheerio = require('cheerio');
var Proxy = require('../services/proxy');
var request = Proxy.setupAndRotateRequestLib('request-promise', 'gol');
const Keys = require('../../configs/keys');
const TIME_LIMIT = 10000; // 10s;

module.exports = format;

async function format(jsonRedeemResponse, jsonCashResponse, searchParams) {
    try {
        var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'gol');
        var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;
        var departureDate = new Date(searchParams.departureDate);

        if (!jsonRedeemResponse["requestedFlightSegmentList"][0]["flightList"].length) {
            response["Trechos"][goingStretchString] = {"Voos": []};
            return response;
        }

        response["Trechos"][goingStretchString] = {
            "Semana": formatRedeemWeekPrices(getMin(jsonRedeemResponse["requestedFlightSegmentList"][0]["flightList"])["fareList"][0], departureDate),
            "Voos": await getFlightList(jsonCashResponse, jsonRedeemResponse["requestedFlightSegmentList"][0]["flightList"], true, searchParams)
        };

        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;

            response["Trechos"][comingStretchString] = {
                "Semana": formatRedeemWeekPrices(getMin(jsonRedeemResponse["requestedFlightSegmentList"][1]["flightList"])["fareList"][0], departureDate),
                "Voos": await getFlightList(jsonCashResponse, jsonRedeemResponse["requestedFlightSegmentList"][1]["flightList"], false, searchParams)
            };
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
            var cashInfo = getCashFlightByLegs(cash, flight["legList"]);

            var mil = {
                "Adulto": flight["fareList"][0]["miles"],
                "TaxaEmbarque": await TaxObtainer.getTax(flight["departure"]["airport"]["code"], 'gol',
                                                        searchParams.originCountry, searchParams.destinationCountry, isGoing)
            };

            if (searchParams.children > 0) {
                mil["Crianca"] = flight["fareList"][0]["miles"];
            }

            var flightFormatted = {
                "Desembarque": Time.getDateTime(new Date(flight["arrival"]["date"])),
                "NumeroConexoes": flight["legList"].length - 1,
                "NumeroVoo": flight["legList"][0].flightNumber,
                "Duracao": Parser.parseDigits(flight["duration"]["hours"], 2) + ":" + Parser.parseDigits(flight["duration"]["minutes"], 2),
                "Origem": flight["departure"]["airport"]["code"],
                "Embarque": Time.getDateTime(new Date(flight["departure"]["date"])),
                "Destino": flight["arrival"]["airport"]["code"],
                "Companhia": "GOL",
                "valuesType": 0,
                "isPromotional": false,
                "Sentido": isGoing ? "ida" : "volta",
                "Milhas": [
                    mil
                ],
                "Valor": []
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
                flight["legList"].forEach(function (connection) {
                    var connectionFormatted = {
                        "NumeroVoo": connection["flightNumber"],
                        "Embarque": Time.getDateTime(new Date(connection["departure"]["date"])),
                        "Origem": connection["departure"]["airport"]["code"],
                        "Destino": connection["arrival"]["airport"]["code"],
                        "Desembarque": Time.getDateTime(new Date(connection["arrival"]["date"]))
                    };

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

function getCashFlightByLegs(cashFlights, redeemLegs) {
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