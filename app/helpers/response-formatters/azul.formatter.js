/**
 * @author Sávio Muniz
 */

var Time = require('../time-utils');
var Parser = require('../parse-utils');
var CONSTANTS = require('../constants');
var cheerio = require('cheerio');
var formatter = require('../format.helper');
const Proxy = require('../proxy');
var rp = Proxy.setupAndRotateRequestLib('request-promise', false);
const CHILD_DISCOUNT = 0.8;

module.exports = format;

var params = null;
var airportsTaxes = {};

async function format(redeemResponse, cashResponse, searchParams) {
    try {
        params = searchParams;
        var flights = await scrapHTML(cashResponse, redeemResponse);
        var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'azul');
        var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;
        var departureDate = new Date(searchParams.departureDate);
        response["Trechos"][goingStretchString] = {
            "Voos": parseJSON(flights.going, searchParams, true)
        };

        if (searchParams.returnDate) {
            var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;

            response["Trechos"][comingStretchString] = {
                "Voos": parseJSON(flights.coming, searchParams, false)
            };
        }

        return response;
    } catch (err) {
        return { error: err.stack };
    }
}



function parseJSON(flights, params, isGoing) {
    try {
        var outputFlights = [];
        flights.forEach(function (flight) {
            var dates = Time.getFlightDates(isGoing ? params.departureDate : params.returnDate, flight.departureTime, flight.arrivalTime);
            var outputFlight = {
                'Desembarque': dates.arrival + " " + flight.arrivalTime,
                'NumeroConexoes': flight.connections.length,
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
                if (params.children > 0) {
                    if (cash['TipoValor'] === 'business') {
                        cash['Crianca'] = cash['Adulto'];
                    } else {
                        cash['Crianca'] = (cash['Adulto'] * CHILD_DISCOUNT).toFixed(2);
                    }
                }
                outputFlight['Valor'].push(cash);

            });
            flight.redeemPrice.forEach(redeem => {
                if (Parser.isNumber(redeem.price)) {
                    var mil = {
                        'Bebe': 0,
                        'Executivo': false,
                        'TaxaAdulto': 0,
                        'TipoMilhas': redeem.id,
                        'TaxaBebe': 0,
                        'Adulto': Parser.parseLocaleStringToNumber(redeem.price),
                        'TaxaEmbarque': Parser.parseLocaleStringToNumber(airportsTaxes[flight.departureAirport])
                    };
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
            });


            // if (Parser.isNumber(flight.redeemPrice[1].price)) {
            //     if (params.international)
            //         outputFlight['Milhas'].push({
            //             'Bebe': 0,
            //             'Executivo': true,
            //             'TaxaAdulto': 0,
            //             'TipoMilhas': flight.redeemPrice[1].id,
            //             'TaxaBebe': 0,
            //             'Crianca': 0,
            //             'Adulto': Parser.parseLocaleStringToNumber(flight.redeemPrice[1].price),
            //             'TaxaCrianca': 0,
            //             'TaxaEmbarque': Parser.parseLocaleStringToNumber(airportsTaxes[flight.departureAirport])
            //         });

            // }


            outputFlight.Conexoes = [];

            flight.connections.forEach(function (connection) {
                var outputConnection = {
                    'NumeroVoo': connection.number,
                    'Duracao': connection.duration,
                    'Embarque': connection.departure,
                    'Destino': connection.destination,
                    'Origem': connection.origin,
                    'Desembarque': connection.arrival
                };

                outputFlight.Conexoes.push(outputConnection);
            });
            if (outputFlight['Milhas'].length < 1) {
                outputFlight = {};
            }
            outputFlights.push(outputFlight);
        });

        return outputFlights;
    } catch (err) {
        throw err;
    }
}

async function scrapHTML(cashResponse, redeemResponse) {
    try {
        var $ = cheerio.load(cashResponse);

        var flights = { going: [], coming: [], goingWeek: {}, comingWeek: {} };

        var tableChildren = [];
        $('tbody', 'table.tbl-flight-details.tbl-depart-flights').children().each(function () {
            tableChildren.push($(this));
        });

        for (let child of tableChildren) {
            var goingInfo = await extractTableInfo(child);

            if (goingInfo)
                flights.going.push(goingInfo)
        }

        tableChildren = [];

        $('tbody', 'table.tbl-flight-details.tbl-return-flights').children().each(function () {
            tableChildren.push($(this));
        });

        for (let child of tableChildren) {
            var returningInfo = await extractTableInfo(child);

            if (returningInfo)
                flights.coming.push(returningInfo)
        }

        $ = cheerio.load(redeemResponse);

        var itRedeem = 0;

        $('tbody', 'table.tbl-flight-details.tbl-depart-flights').children().each(function () {
            var tr = $(this);

            var goingRedeemInfo = extractRedeemInfo(tr, flights);
            if (goingRedeemInfo)
                flights.going[itRedeem].redeemPrice = goingRedeemInfo;

            itRedeem++;
        });

        itRedeem = 0;

        $('tbody', 'table.tbl-flight-details.tbl-return-flights').children().each(function () {
            var tr = $(this);

            var goingRedeemInfo = extractRedeemInfo(tr, flights);
            if (goingRedeemInfo)
                flights.coming[itRedeem].redeemPrice = goingRedeemInfo;

            itRedeem++;
        });


        return flights;
    } catch (err) {
        throw err;
    }

}

async function extractTableInfo(tr) {
    try {
        var flight = {};
        var price1 = tr.children().eq(1).find('.fare-price').text();
        var price2 = tr.children().eq(2).find('.fare-price').text();
        if (Parser.isNumber(price1) || Parser.isNumber(price2)) {
            var infoButton = tr.children().eq(0)
                .find('span.bubblehelp.bubblehelp--js').eq(0).find('button');

            var departureTimes = infoButton.attr('departuretime').split(',');
            var arrivalTimes = infoButton.attr('arrivaltime').split(',');
            var origins = infoButton.attr('departure').split(',');
            var destinations = infoButton.attr('arrival').split(',');
            var flightNumbers = infoButton.attr('flightnumber').split(',');

            flight.number = flightNumbers[0];
            flight.departureTime = departureTimes[0];
            flight.departureAirport = origins[0];
            flight.duration = infoButton.attr('traveltime');
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
            await pullAirportTaxInfo(flight);

            return flight;
        }
    } catch (err) {
        throw err;
    }

}

function extractRedeemInfo(tr) {
    try {
        var redeem1 = tr.children().eq(1).find('.fare-price').text();
        var redeem2 = tr.children().eq(2).find('.fare-price').text();
        var miles = [{ id: params.international ? 'economy' : 'tudoazul', price: tr.children().eq(1).find('.fare-price').eq(0).text() }];
        if (params.international) {
            miles.push({ id: 'business', price: tr.children().eq(2).find('.fare-price').eq(0).text() });
        }
        return miles;
    }

    catch (err) {
        throw err;
    }
}

async function pullAirportTaxInfo(flight) {
    if (airportsTaxes[flight.departureAirport]) {
        return airportsTaxes[flight.departureAirport];
    }
    var postParams = { departureIda: '', departureTimeIda: '', arrivalIda: '', arrivalTimeIda: '', flightNumberIda: '' };

    if (flight.connections.length > 0) {
        flight.connections.forEach(function (connection, index) {
            postParams.departureIda += connection.origin;
            postParams.departureTimeIda += connection.departure;
            postParams.arrivalIda += connection.destination;
            postParams.arrivalTimeIda += connection.arrival;
            postParams.flightNumberIda += connection.number;

            if (index !== (flight.connections.length - 1)) {
                Object.keys(postParams).forEach(function (param) {
                    postParams[param] += ','
                }) //multiple parameters are separated by comma (e.g. "REC,VCP"; "08:00,12:20")
            }
        })
    }

    else {
        postParams.departureIda += flight.departureAirport;
        postParams.departureTimeIda += flight.departureTime;
        postParams.arrivalIda += flight.arrivalAirport;
        postParams.arrivalTimeIda += flight.arrivalTime;
        postParams.flightNumberIda += flight.number;
    }

    var date = flight.departureAirport === params.originAirportCode ? params.departureDate : params.returnDate;

    var STDIda = '';
    postParams.departureTimeIda.split(',').forEach(function (departure, index) {
        STDIda += (date + " " + departure + ":00");
        if (index !== postParams.departureIda.split(',').length - 1)
            STDIda += "|"
    });

    postParams.STDIda = STDIda;

    var requestQueryParams = {
        'SellKeyIda': flight.prices[0].purchaseCode,
        'SellKeyVolta': '',
        'QtdInstallments': '1',
        'TawsIdIda': 'undefined',
        'TawsIdVolta': '',
        'IsBusinessTawsIda': '',
        'IsBusinessTawsVolta': '',
        'DepartureIda': postParams.departureIda,
        'DepartureTimeIda': postParams.departureTimeIda,
        'ArrivalIda': postParams.arrivalIda,
        'ArrivalTimeIda': postParams.arrivalTimeIda,
        'DepartureVolta': '',
        'DepartureTimeVolta': '',
        'ArrivalVolta': '',
        'ArrivalTimeVolta': '',
        'FlightNumberIda': postParams.flightNumberIda,
        'FlightNumberVolta': '',
        'CarrierCodeIda': 'AD,AD,AD',
        'CarrierCodeVolta': '',
        'STDIda': postParams.STDIda,
        'STDVolta': ''
    };

    var urlFormatted = 'https://viajemais.voeazul.com.br/SelectPriceBreakDownAjax.aspx?';

    Object.keys(requestQueryParams).forEach(function (param, index) {
        urlFormatted += param + "=" + requestQueryParams[param];
        if (index !== Object.keys(requestQueryParams).length - 1) {
            urlFormatted += "&";
        }
    });

    urlFormatted = urlFormatted.replace(/\s/g, '%20');

    var jar = rp.jar();

    if (params.returnDate) {
        var isGoing = params.originAirportCode === flight.departureAirport;
        params.originAirportCode = flight.departureAirport;
        params.destinationAirportCode = flight.arrivalAirport;
        params.departureDate = isGoing ? params.departureDate : params.returnDate;
    }
    await rp.post({ url: 'https://viajemais.voeazul.com.br/Search.aspx', form: formatter.formatAzulForm(params, true), jar: jar });
    await rp.get({ url: 'https://viajemais.voeazul.com.br/Availability.aspx', jar: jar });
    var body = await rp.get({ url: urlFormatted, jar: jar });
    var $ = cheerio.load(body);
    var span = $('.tax').find('span');
    airportsTaxes[flight.departureAirport] = span.eq(0).text();
}

// {
//     "Desembarque":"01/03/2018 13:10",
//     "NumeroConexoes":2,
//     "NumeroVoo":"AD5077",
//     "Duracao":"05:45",
//     "Origem":"JPA",
//     "Embarque":"01/03/2018 07:25",
//     "Destino":"GRU",
//     "Conexoes":[
//     {
//         "NumeroVoo":"AD5077",
//         "Duracao":"00:35",
//         "Embarque":"07:25",
//         "Destino":"REC",
//         "Origem":"JPA",
//         "Desembarque":"08:00"
//     },
//     {
//         "NumeroVoo":"AD2581",
//         "Duracao":"02:35",
//         "Embarque":"08:45",
//         "Destino":"CNF",
//         "Origem":"REC",
//         "Desembarque":"11:20"
//     },
//     {
//         "NumeroVoo":"AD4952",
//         "Duracao":"01:20",
//         "Embarque":"11:50",
//         "Destino":"GRU",
//         "Origem":"CNF",
//         "Desembarque":"13:10"
//     }
// ],
//     "Valor":[
//     {
//         "Bebe":0,
//         "Executivo":false,
//         "TipoValor":"promo",
//         "Crianca":0,
//         "TaxaEmbarque":24.57,
//         "Adulto":1745.37
//     },
//     {
//         "Bebe":0,
//         "Executivo":false,
//         "TipoValor":"flex",
//         "Crianca":0,
//         "TaxaEmbarque":24.57,
//         "Adulto":1785.37
//     }
// ],
//     "Milhas":[
//     {
//         "Bebe":0,
//         "Executivo":false,
//         "TaxaAdulto":0,
//         "TipoMilhas":"tudoazul",
//         "TaxaBebe":0,
//         "Crianca":0,
//         "TaxaEmbarque":24.57,
//         "Adulto":50000,
//         "TaxaCrianca":0,
//         "PrecoAdulto":1815.96,
//         "PrecoCrianca":0
//     }
// ],
//     "Sentido":"ida",
//     "Companhia":"AZUL",
//     "valuesType":0,
//     "isPromotional":false
// }

// "Conexoes":[
//     {
//         "NumeroVoo":"AD5077",
//         "Duracao":"00:35",
//         "Embarque":"07:25",
//         "Destino":"REC",
//         "Origem":"JPA",
//         "Desembarque":"08:00"

// "Semana":{
//     "02/03/2018":[
//         {
//             "Milhas":"",
//             "Valor":"",
//             "Companhia":"AZUL"
//         }
//     ],
//         "26/02/2018":[
//         {
//             "Milhas":"",
//             "Valor":"",
//             "Companhia":"AZUL"
//         }
//     ],
//         "04/03/2018":[
//         {
//             "Milhas":"",
//             "Valor":"",
//             "Companhia":"AZUL"
//         }
//     ],
//         "03/03/2018":[
//         {
//             "Milhas":"",
//             "Valor":"",
//             "Companhia":"AZUL"
//         }
//     ],
//         "28/02/2018":[
//         {
//             "Milhas":"",
//             "Valor":"",
//             "Companhia":"AZUL"
//         }
//     ],
//         "27/02/2018":[
//         {
//             "Milhas":"",
//             "Valor":"",
//             "Companhia":"AZUL"
//         }
//     ],
//         "01/03/2018":[
//         {
//             "Milhas":"",
//             "Valor":"",
//             "Companhia":"AZUL"
//         }
//     ]


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