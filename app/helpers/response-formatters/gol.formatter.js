/**
 * @author Sávio Muniz
 */

var Time = require('../time-utils');
var Parser = require('../parse-utils');
var CONSTANTS = require('../constants');
var cheerio = require('cheerio');

module.exports = format;

function format(jsonRedeemResponse, jsonCashResponse, searchParams) {
    try {
        var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'gol');
        var cash = scrapHTML(jsonCashResponse, searchParams);
        var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;
        var departureDate = new Date(searchParams.departureDate);

        response["Trechos"][goingStretchString] = {
            "Semana": formatRedeemWeekPrices(getMin(jsonRedeemResponse["requestedFlightSegmentList"][0]["flightList"])["fareList"][0], departureDate),
            "Voos": getFlightList(cash, jsonRedeemResponse["requestedFlightSegmentList"][0]["flightList"], true)
        };

        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;

            response["Trechos"][comingStretchString] = {
                "Semana": formatRedeemWeekPrices(getMin(jsonRedeemResponse["requestedFlightSegmentList"][1]["flightList"])["fareList"][0], departureDate),
                "Voos": getFlightList(cash, jsonRedeemResponse["requestedFlightSegmentList"][1]["flightList"], true)
            };
        }

        return response;
    } catch (err) {
        return {error: err.stack};
    }
}

function getFlightList(cash, flightList, isGoing) {
    try {
        var output = [];
        flightList.forEach(function (flight) {
            var flightNumber = flight["legList"][0].flightNumber;
            var timeoutGoing = Time.getDateTime(new Date(flight["arrival"]["date"])).substring(11, 16);
            var index;
            for (let i = 0; i < cash.flightNumber.length; i++) {
                if (flightNumber == cash.flightNumber[i] && cash.timeoutGoing[i] == timeoutGoing) {
                    index = i;
                }
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
                    {
                        "Adulto": flight["fareList"][0]["miles"],
                        "TaxaEmbarque": Parser.parseLocaleStringToNumber(cash.taxes.comfort[index])
                    }
                ],
                "Valor": [
                    {
                        "Bebe": 0,
                        "Executivo": false,
                        "Crianca": 0,
                        "Adulto": Parser.parseLocaleStringToNumber(cash.money.comfort[index]),
                        "TipoValor": "Comfort"
                    },
                    {
                        "Bebe": 0,
                        "Executivo": false,
                        "Crianca": 0,
                        "Adulto": Parser.parseLocaleStringToNumber(cash.money.executive[index]),
                        "TipoValor": "Executive"
                    },
                    {
                        "Bebe": 0,
                        "Executivo": false,
                        "Crianca": 0,
                        "Adulto": Parser.parseLocaleStringToNumber(cash.money.promo[index]),
                        "TipoValor": "Promo"
                    }
                ]
            };
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
            index = -1;
            output.push(flightFormatted)
        });
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

        var money = {comfort: [], executive: [], promo: []};
        var taxes = {comfort: [], executive: [], promo: []};
        var flightNumber = [];
        var timeoutGoing = [];
        $('table.tableTarifasSelect').children().each(function () {
            var table = $(this);

            table.find('td.taxa').children().each(function () {
                var td = $(this);
                var fareValueSpan = td.find('span.fareValue');
                if (fareValueSpan.length > 0) {
                    var len = fareValueSpan.text().length;
                    var fareValue = td.find('span.fareValue').text().substring(82, len);
                    var otherTaxes = td.find('input').attr('data-othertaxes');
                    switch (td.parent().attr('class').split(' ')[1]) {
                        case 'taxaPromocional':
                            money.promo.push(fareValue);
                            taxes.promo.push(otherTaxes);
                            break;
                        case 'taxaExecutivaNew':
                        case 'taxaExecutiva':
                            money.executive.push(fareValue);
                            taxes.executive.push(otherTaxes);
                            break;
                        case 'taxaComfort':
                            money.comfort.push(fareValue);
                            taxes.comfort.push(otherTaxes);
                            break;
                    }
                }
            });

            var div = table.find('div.status').children().eq(0);

            if (div.find('span.data-attr-flightNumber').text() !== null && div.find('span.data-attr-flightNumber').text() !== "") {
                flightNumber.push(div.find('span.data-attr-flightNumber').text());
            }

            if (div.find('span.data-attr-flightNumber').text() !== null && div.next().find('span.timeoutGoing').find('span.hour').text() !== "") {
                timeoutGoing.push(div.next().find('span.timeoutGoing').find('span.hour').text());
            }

        });

        var moneyFormatted = formatMoney(money);
        return {money: moneyFormatted, flightNumber: flightNumber, timeoutGoing: timeoutGoing, taxes: taxes};
    } catch (e) {
        throw e;
    }
}

function formatMoney(money) {
    try {
        money.comfort.forEach(money => {
            money = money.replace(",", ".");
        });

        money.executive.forEach(money => {
            money = money.replace(",", ".");
        });

        money.promo.forEach(money => {
            money = money.replace(",", ".");
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
/*
{
    "results":{
    "Status":{
        "Alerta":[

        ],
            "Erro":false,
            "Sucesso":true
    },
    "Busca":{
        "Criancas":0,
            "Adultos":1,
            "TipoViagem":1,
            "Trechos":[
            {
                "DataIda":"01/03/2018",
                "Destino":"GRU",
                "DataVolta":"01/04/2018",
                "Origem":"JPA"
            }
        ],
            "Chave":"df40bb87c05b8fc3385630fff6ca0145d0ca5cda",
            "Senha":"3d3320991273206dc3154338293178ba776d636b",
            "TipoBusca":1,
            "Bebes":0,
            "Companhias":[
            "azul"
        ]
    },
    "Trechos":{
        "JPAGRU":{
            "Semana":{
                "02/03/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ],
                    "26/02/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ],
                    "04/03/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ],
                    "03/03/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ],
                    "28/02/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ],
                    "27/02/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ],
                    "01/03/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ]
            },
            "Voos":[
                {
                    "Desembarque":"01/03/2018 13:10",
                    "NumeroConexoes":2,
                    "NumeroVoo":"AD5077",
                    "Duracao":"05:45",
                    "Origem":"JPA",
                    "Embarque":"01/03/2018 07:25",
                    "Destino":"GRU",
                    "Conexoes":[
                        {
                            "NumeroVoo":"AD5077",
                            "Duracao":"00:35",
                            "Embarque":"07:25",
                            "Destino":"REC",
                            "Origem":"JPA",
                            "Desembarque":"08:00"
                        },
                        {
                            "NumeroVoo":"AD2581",
                            "Duracao":"02:35",
                            "Embarque":"08:45",
                            "Destino":"CNF",
                            "Origem":"REC",
                            "Desembarque":"11:20"
                        },
                        {
                            "NumeroVoo":"AD4952",
                            "Duracao":"01:20",
                            "Embarque":"11:50",
                            "Destino":"GRU",
                            "Origem":"CNF",
                            "Desembarque":"13:10"
                        }
                    ],
                    "Valor":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"promo",
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":1745.37
                        },
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"flex",
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":1785.37
                        }
                    ],
                    "Milhas":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TaxaAdulto":0,
                            "TipoMilhas":"tudoazul",
                            "TaxaBebe":0,
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":50000,
                            "TaxaCrianca":0,
                            "PrecoAdulto":1815.96,
                            "PrecoCrianca":0
                        }
                    ],
                    "Sentido":"ida",
                    "Companhia":"AZUL",
                    "valuesType":0,
                    "isPromotional":false
                },
                {
                    "Desembarque":"01/03/2018 16:50",
                    "NumeroConexoes":2,
                    "NumeroVoo":"AD5077",
                    "Duracao":"09:25",
                    "Origem":"JPA",
                    "Embarque":"01/03/2018 07:25",
                    "Destino":"GRU",
                    "Conexoes":[
                        {
                            "NumeroVoo":"AD5077",
                            "Duracao":"00:35",
                            "Embarque":"07:25",
                            "Destino":"REC",
                            "Origem":"JPA",
                            "Desembarque":"08:00"
                        },
                        {
                            "NumeroVoo":"AD2581",
                            "Duracao":"02:35",
                            "Embarque":"08:45",
                            "Destino":"CNF",
                            "Origem":"REC",
                            "Desembarque":"11:20"
                        },
                        {
                            "NumeroVoo":"AD2413",
                            "Duracao":"01:20",
                            "Embarque":"15:30",
                            "Destino":"GRU",
                            "Origem":"CNF",
                            "Desembarque":"16:50"
                        }
                    ],
                    "Valor":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"promo",
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":1745.37
                        },
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"flex",
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":1785.37
                        }
                    ],
                    "Milhas":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TaxaAdulto":0,
                            "TipoMilhas":"tudoazul",
                            "TaxaBebe":0,
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":50000,
                            "TaxaCrianca":0,
                            "PrecoAdulto":1815.96,
                            "PrecoCrianca":0
                        }
                    ],
                    "Sentido":"ida",
                    "Companhia":"AZUL",
                    "valuesType":0,
                    "isPromotional":false
                },
                {
                    "Desembarque":"01/03/2018 12:25",
                    "NumeroConexoes":1,
                    "NumeroVoo":"AD5077",
                    "Duracao":"05:00",
                    "Origem":"JPA",
                    "Embarque":"01/03/2018 07:25",
                    "Destino":"GRU",
                    "Conexoes":[
                        {
                            "NumeroVoo":"AD5077",
                            "Duracao":"00:35",
                            "Embarque":"07:25",
                            "Destino":"REC",
                            "Origem":"JPA",
                            "Desembarque":"08:00"
                        },
                        {
                            "NumeroVoo":"AD5019",
                            "Duracao":"03:25",
                            "Embarque":"09:00",
                            "Destino":"GRU",
                            "Origem":"REC",
                            "Desembarque":"12:25"
                        }
                    ],
                    "Valor":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"promo",
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":1745.37
                        },
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"flex",
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":1785.37
                        }
                    ],
                    "Milhas":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TaxaAdulto":0,
                            "TipoMilhas":"tudoazul",
                            "TaxaBebe":0,
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":50000,
                            "TaxaCrianca":0,
                            "PrecoAdulto":1815.96,
                            "PrecoCrianca":0
                        }
                    ],
                    "Sentido":"ida",
                    "Companhia":"AZUL",
                    "valuesType":0,
                    "isPromotional":false
                },
                {
                    "Desembarque":"01/03/2018 17:05",
                    "NumeroConexoes":1,
                    "NumeroVoo":"AD5077",
                    "Duracao":"09:40",
                    "Origem":"JPA",
                    "Embarque":"01/03/2018 07:25",
                    "Destino":"GRU",
                    "Conexoes":[
                        {
                            "NumeroVoo":"AD5077",
                            "Duracao":"00:35",
                            "Embarque":"07:25",
                            "Destino":"REC",
                            "Origem":"JPA",
                            "Desembarque":"08:00"
                        },
                        {
                            "NumeroVoo":"AD6955",
                            "Duracao":"03:28",
                            "Embarque":"13:37",
                            "Destino":"GRU",
                            "Origem":"REC",
                            "Desembarque":"17:05"
                        }
                    ],
                    "Valor":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"promo",
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":1745.37
                        },
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"flex",
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":1785.37
                        }
                    ],
                    "Milhas":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TaxaAdulto":0,
                            "TipoMilhas":"tudoazul",
                            "TaxaBebe":0,
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":50000,
                            "TaxaCrianca":0,
                            "PrecoAdulto":1815.96,
                            "PrecoCrianca":0
                        }
                    ],
                    "Sentido":"ida",
                    "Companhia":"AZUL",
                    "valuesType":0,
                    "isPromotional":false
                },
                {
                    "Desembarque":"01/03/2018 22:50",
                    "NumeroConexoes":2,
                    "NumeroVoo":"AD5737",
                    "Duracao":"07:05",
                    "Origem":"JPA",
                    "Embarque":"01/03/2018 15:45",
                    "Destino":"GRU",
                    "Conexoes":[
                        {
                            "NumeroVoo":"AD5737",
                            "Duracao":"00:40",
                            "Embarque":"15:45",
                            "Destino":"REC",
                            "Origem":"JPA",
                            "Desembarque":"16:25"
                        },
                        {
                            "NumeroVoo":"AD2883",
                            "Duracao":"02:35",
                            "Embarque":"17:35",
                            "Destino":"CNF",
                            "Origem":"REC",
                            "Desembarque":"20:10"
                        },
                        {
                            "NumeroVoo":"AD5195",
                            "Duracao":"01:20",
                            "Embarque":"21:30",
                            "Destino":"GRU",
                            "Origem":"CNF",
                            "Desembarque":"22:50"
                        }
                    ],
                    "Valor":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"promo",
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":1595.37
                        },
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"flex",
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":1635.37
                        }
                    ],
                    "Milhas":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TaxaAdulto":0,
                            "TipoMilhas":"tudoazul",
                            "TaxaBebe":0,
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":50000,
                            "TaxaCrianca":0,
                            "PrecoAdulto":1815.96,
                            "PrecoCrianca":0
                        }
                    ],
                    "Sentido":"ida",
                    "Companhia":"AZUL",
                    "valuesType":0,
                    "isPromotional":false
                },
                {
                    "Desembarque":"01/03/2018 21:00",
                    "NumeroConexoes":1,
                    "NumeroVoo":"AD5737",
                    "Duracao":"05:15",
                    "Origem":"JPA",
                    "Embarque":"01/03/2018 15:45",
                    "Destino":"GRU",
                    "Conexoes":[
                        {
                            "NumeroVoo":"AD5737",
                            "Duracao":"00:40",
                            "Embarque":"15:45",
                            "Destino":"REC",
                            "Origem":"JPA",
                            "Desembarque":"16:25"
                        },
                        {
                            "NumeroVoo":"AD5333",
                            "Duracao":"03:30",
                            "Embarque":"17:30",
                            "Destino":"GRU",
                            "Origem":"REC",
                            "Desembarque":"21:00"
                        }
                    ],
                    "Valor":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"promo",
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":1595.37
                        },
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"flex",
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":1635.37
                        }
                    ],
                    "Milhas":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TaxaAdulto":0,
                            "TipoMilhas":"tudoazul",
                            "TaxaBebe":0,
                            "Crianca":0,
                            "TaxaEmbarque":24.57,
                            "Adulto":50000,
                            "TaxaCrianca":0,
                            "PrecoAdulto":1815.96,
                            "PrecoCrianca":0
                        }
                    ],
                    "Sentido":"ida",
                    "Companhia":"AZUL",
                    "valuesType":0,
                    "isPromotional":false
                }
            ],
                "Destino":"GRU",
                "Data":"01/03/2018",
                "Origem":"JPA"
        },
        "GRUJPA":{
            "Semana":{
                "03/04/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ],
                    "30/03/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ],
                    "29/03/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ],
                    "01/04/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ],
                    "02/04/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ],
                    "31/03/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ],
                    "04/04/2018":[
                    {
                        "Milhas":"",
                        "Valor":"",
                        "Companhia":"AZUL"
                    }
                ]
            },
            "Voos":[
                {
                    "Desembarque":"01/04/2018 14:30",
                    "NumeroConexoes":1,
                    "NumeroVoo":"AD2572",
                    "Duracao":"05:05",
                    "Origem":"GRU",
                    "Embarque":"01/04/2018 09:25",
                    "Destino":"JPA",
                    "Conexoes":[
                        {
                            "NumeroVoo":"AD2572",
                            "Duracao":"03:10",
                            "Embarque":"09:25",
                            "Destino":"REC",
                            "Origem":"GRU",
                            "Desembarque":"12:35"
                        },
                        {
                            "NumeroVoo":"AD2830",
                            "Duracao":"00:45",
                            "Embarque":"13:45",
                            "Destino":"JPA",
                            "Origem":"REC",
                            "Desembarque":"14:30"
                        }
                    ],
                    "Valor":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"promo",
                            "Crianca":0,
                            "TaxaEmbarque":29.53,
                            "Adulto":735.33
                        },
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"flex",
                            "Crianca":0,
                            "TaxaEmbarque":29.53,
                            "Adulto":775.33
                        }
                    ],
                    "Milhas":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TaxaAdulto":0,
                            "TipoMilhas":"tudoazul",
                            "TaxaBebe":0,
                            "Crianca":0,
                            "TaxaEmbarque":29.53,
                            "Adulto":33000,
                            "TaxaCrianca":0,
                            "PrecoAdulto":1102.4564400000002,
                            "PrecoCrianca":0,
                            "PrecoAdultoOriginal":1224.9516
                        }
                    ],
                    "Sentido":"volta",
                    "Companhia":"AZUL",
                    "valuesType":0,
                    "isPromotional":true
                },
                {
                    "Desembarque":"01/04/2018 23:40",
                    "NumeroConexoes":2,
                    "NumeroVoo":"AD4962",
                    "Duracao":"10:30",
                    "Origem":"GRU",
                    "Embarque":"01/04/2018 13:10",
                    "Destino":"JPA",
                    "Conexoes":[
                        {
                            "NumeroVoo":"AD4962",
                            "Duracao":"01:40",
                            "Embarque":"13:10",
                            "Destino":"GYN",
                            "Origem":"GRU",
                            "Desembarque":"14:50"
                        },
                        {
                            "NumeroVoo":"AD2698",
                            "Duracao":"02:40",
                            "Embarque":"19:25",
                            "Destino":"REC",
                            "Origem":"GYN",
                            "Desembarque":"22:05"
                        },
                        {
                            "NumeroVoo":"AD5087",
                            "Duracao":"00:50",
                            "Embarque":"22:50",
                            "Destino":"JPA",
                            "Origem":"REC",
                            "Desembarque":"23:40"
                        }
                    ],
                    "Valor":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"promo",
                            "Crianca":0,
                            "TaxaEmbarque":29.53,
                            "Adulto":735.33
                        },
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"flex",
                            "Crianca":0,
                            "TaxaEmbarque":29.53,
                            "Adulto":775.33
                        }
                    ],
                    "Milhas":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TaxaAdulto":0,
                            "TipoMilhas":"tudoazul",
                            "TaxaBebe":0,
                            "Crianca":0,
                            "TaxaEmbarque":29.53,
                            "Adulto":33000,
                            "TaxaCrianca":0,
                            "PrecoAdulto":1102.4564400000002,
                            "PrecoCrianca":0,
                            "PrecoAdultoOriginal":1224.9516
                        }
                    ],
                    "Sentido":"volta",
                    "Companhia":"AZUL",
                    "valuesType":0,
                    "isPromotional":true
                },
                {
                    "Desembarque":"01/04/2018 23:40",
                    "NumeroConexoes":2,
                    "NumeroVoo":"AD2733",
                    "Duracao":"06:30",
                    "Origem":"GRU",
                    "Embarque":"01/04/2018 17:10",
                    "Destino":"JPA",
                    "Conexoes":[
                        {
                            "NumeroVoo":"AD2733",
                            "Duracao":"01:20",
                            "Embarque":"17:10",
                            "Destino":"CNF",
                            "Origem":"GRU",
                            "Desembarque":"18:30"
                        },
                        {
                            "NumeroVoo":"AD2432",
                            "Duracao":"02:30",
                            "Embarque":"19:30",
                            "Destino":"REC",
                            "Origem":"CNF",
                            "Desembarque":"22:00"
                        },
                        {
                            "NumeroVoo":"AD5087",
                            "Duracao":"00:50",
                            "Embarque":"22:50",
                            "Destino":"JPA",
                            "Origem":"REC",
                            "Desembarque":"23:40"
                        }
                    ],
                    "Valor":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"promo",
                            "Crianca":0,
                            "TaxaEmbarque":29.53,
                            "Adulto":1050.33
                        },
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"flex",
                            "Crianca":0,
                            "TaxaEmbarque":29.53,
                            "Adulto":1090.33
                        }
                    ],
                    "Milhas":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TaxaAdulto":0,
                            "TipoMilhas":"tudoazul",
                            "TaxaBebe":0,
                            "Crianca":0,
                            "TaxaEmbarque":29.53,
                            "Adulto":47000,
                            "TaxaCrianca":0,
                            "PrecoAdulto":1540.4979600000001,
                            "PrecoCrianca":0,
                            "PrecoAdultoOriginal":1711.6644000000001
                        }
                    ],
                    "Sentido":"volta",
                    "Companhia":"AZUL",
                    "valuesType":0,
                    "isPromotional":true
                },
                {
                    "Desembarque":"01/04/2018 23:40",
                    "NumeroConexoes":1,
                    "NumeroVoo":"AD5292",
                    "Duracao":"05:10",
                    "Origem":"GRU",
                    "Embarque":"01/04/2018 18:30",
                    "Destino":"JPA",
                    "Conexoes":[
                        {
                            "NumeroVoo":"AD5292",
                            "Duracao":"03:10",
                            "Embarque":"18:30",
                            "Destino":"REC",
                            "Origem":"GRU",
                            "Desembarque":"21:40"
                        },
                        {
                            "NumeroVoo":"AD5087",
                            "Duracao":"00:50",
                            "Embarque":"22:50",
                            "Destino":"JPA",
                            "Origem":"REC",
                            "Desembarque":"23:40"
                        }
                    ],
                    "Valor":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"promo",
                            "Crianca":0,
                            "TaxaEmbarque":29.53,
                            "Adulto":735.33
                        },
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TipoValor":"flex",
                            "Crianca":0,
                            "TaxaEmbarque":29.53,
                            "Adulto":775.33
                        }
                    ],
                    "Milhas":[
                        {
                            "Bebe":0,
                            "Executivo":false,
                            "TaxaAdulto":0,
                            "TipoMilhas":"tudoazul",
                            "TaxaBebe":0,
                            "Crianca":0,
                            "TaxaEmbarque":29.53,
                            "Adulto":33000,
                            "TaxaCrianca":0,
                            "PrecoAdulto":1102.4564400000002,
                            "PrecoCrianca":0,
                            "PrecoAdultoOriginal":1224.9516
                        }
                    ],
                    "Sentido":"volta",
                    "Companhia":"AZUL",
                    "valuesType":0,
                    "isPromotional":true
                }
            ],
                "Destino":"JPA",
                "Data":"01/04/2018",
                "Origem":"GRU"
        }
    },
    "baggagePrice":50,
        "baggagePriceAzul":50
}
}
*/