/**
 * @author Sávio Muniz
 */

const db = require('../services/db-helper');
const TaxObtainer = require('../airports/taxes/tax-obtainer');
let Time = require('../helpers/time-utils');
let Parser = require('../helpers/parse-utils');
let CONSTANTS = require('../helpers/constants');
let cheerio = require('cheerio');
let Proxy = require('../services/proxy');
let request = Proxy.setupAndRotateRequestLib('request-promise', 'gol');
const Keys = require('../../configs/keys');
const TIME_LIMIT = 10000; // 10s;

module.exports = format;

async function format(jsonRedeemResponse, jsonCashResponse, searchParams) {
    try {
        let response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'gol');
        let cash = jsonCashResponse ? scrapHTML(jsonCashResponse, searchParams) : {};
        let goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;
        let departureDate = new Date(searchParams.departureDate);

        response["Trechos"][goingStretchString] = {
            "Semana": formatRedeemWeekPrices(getMin(jsonRedeemResponse["requestedFlightSegmentList"][0]["flightList"])["fareList"][0], departureDate),
            "Voos": await getFlightList(cash, jsonRedeemResponse["requestedFlightSegmentList"][0]["flightList"], true, searchParams)
        };

        if (searchParams.returnDate) {
            let comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;

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
        let output = [];
        for (let flight of flightList) {
            let flightNumber = flight["legList"][0].flightNumber;
            let timeoutGoing = Time.getDateTime(new Date(flight["arrival"]["date"])).substring(11, 16);

            let cashInfo = cash[flightNumber + timeoutGoing];

            let mil = {
                "Adulto": flight["fareList"][0]["miles"],
                "TaxaEmbarque": await TaxObtainer.getTax(flight["departure"]["airport"]["code"], 'gol',
                                                        searchParams.originCountry, searchParams.destinationCountry, isGoing)
            };

            if (searchParams.children > 0) {
                mil["Crianca"] = flight["fareList"][0]["miles"];
            }

            debugger;
            let flightFormatted = {
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
                    let val = {
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
                    let connectionFormatted = {
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
        let min = flightList[0];

        for (let i = 0; i < flightList.length; i++) {
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
        let $ = cheerio.load(cashResponse);

        let money = {};

        $('table.tableTarifasSelect').children().each(function () {
            let table = $(this);

            let prices = {};

            table.find('td.taxa').children().each(function () {
                let td = $(this);
                let fareValueSpan = td.find('span.fareValue');
                let childValueDiv = td.find('.textSelectCHD');
                if (fareValueSpan.length > 0) {
                    let len = fareValueSpan.text().length;
                    let fareValue = td.find('span.fareValue').text().substring(82, len);
                    let flightType = td.parent().attr('class').split(' ')[1].split('taxa')[1];

                    if (!prices[flightType]) {
                        prices[flightType] = {};
                    }
                    prices[flightType]['adult'] = fareValue;
                }
                if (childValueDiv.length > 0) {
                    let childTextLen = childValueDiv.text().length;
                    let childValue = childValueDiv.text().substring(childValueDiv.text().lastIndexOf('$')+2, childTextLen);
                    prices[flightType]['child'] = childValue;
                }
            });

            if (Object.keys(prices).length > 0) {
                let div = table.find('div.status').children().eq(0);

                let flightNumber = div.find('span.data-attr-flightNumber').text();
                let timeoutGoing = div.next().find('span.timeoutGoing').find('span.hour').text();

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
        let outputData = {};
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