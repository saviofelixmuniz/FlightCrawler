/**
 * @author Sávio Muniz
 */

const db = require('../db-helper');
const TaxObtainer = require('../airport-taxes/tax-obtainer');
var Time = require('../time-utils');
var Parser = require('../parse-utils');
var CONSTANTS = require('../constants');
var cheerio = require('cheerio');
var Proxy = require('../proxy');
var request = Proxy.setupAndRotateRequestLib('request-promise', 'gol');
const Keys = require('../../configs/keys');
const TIME_LIMIT = 10000; // 10s;

module.exports = format;

async function format(jsonRedeemResponse, jsonCashResponse, searchParams) {
    try {
        var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'gol');
        var cash = jsonCashResponse ? scrapHTML(jsonCashResponse, searchParams) : {};
        var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;
        var departureDate = new Date(searchParams.departureDate);

        response["Trechos"][goingStretchString] = {
            "Semana": formatRedeemWeekPrices(getMin(jsonRedeemResponse["requestedFlightSegmentList"][0]["flightList"])["fareList"][0], departureDate),
            "Voos": await getFlightList(cash, jsonRedeemResponse["requestedFlightSegmentList"][0]["flightList"], true, searchParams)
        };

        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;

            response["Trechos"][comingStretchString] = {
                "Semana": formatRedeemWeekPrices(getMin(jsonRedeemResponse["requestedFlightSegmentList"][1]["flightList"])["fareList"][0], departureDate),
                "Voos": await getFlightList(cash, jsonRedeemResponse["requestedFlightSegmentList"][1]["flightList"], false, searchParams)
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
            var flightNumber = flight["legList"][0].flightNumber;
            var timeoutGoing = Time.getDateTime(new Date(flight["arrival"]["date"])).substring(11, 16);

            var cashInfo = cash[flightNumber + timeoutGoing];

            var mil = {
                "Adulto": flight["fareList"][0]["miles"],
                "TaxaEmbarque": await TaxObtainer.getTax(flight["departure"]["airport"]["code"], 'gol')
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
                Object.keys(cashInfo).forEach(function (flightType) {
                    var val = {
                        "Bebe": 0,
                        "Executivo": false,
                        "Crianca": cashInfo[flightType]['child'] ? Parser.parseLocaleStringToNumber(cashInfo[flightType]['child']) : 0,
                        "Adulto": Parser.parseLocaleStringToNumber(cashInfo[flightType]['adult']),
                        "TipoValor": flightType
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

function scrapHTML(cashResponse) {
    try {
        var $ = cheerio.load(cashResponse);

        var money = {};

        $('table.tableTarifasSelect').children().each(function () {
            var table = $(this);

            var prices = {};

            table.find('td.taxa').children().each(function () {
                var td = $(this);
                var fareValueSpan = td.find('span.fareValue');
                var childValueDiv = td.find('.textSelectCHD');
                if (fareValueSpan.length > 0) {
                    var len = fareValueSpan.text().length;
                    var fareValue = td.find('span.fareValue').text().substring(82, len);
                    var flightType = td.parent().attr('class').split(' ')[1].split('taxa')[1];

                    if (!prices[flightType]) {
                        prices[flightType] = {};
                    }
                    prices[flightType]['adult'] = fareValue;
                }
                if (childValueDiv.length > 0) {
                    var childTextLen = childValueDiv.text().length;
                    var childValue = childValueDiv.text().substring(childValueDiv.text().lastIndexOf('$')+2, childTextLen);
                    prices[flightType]['child'] = childValue;
                }
            });

            if (Object.keys(prices).length > 0) {
                var div = table.find('div.status').children().eq(0);

                var flightNumber = div.find('span.data-attr-flightNumber').text();
                var timeoutGoing = div.next().find('span.timeoutGoing').find('span.hour').text();

                money[flightNumber + timeoutGoing] = prices;
            }
        });

        return money;
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