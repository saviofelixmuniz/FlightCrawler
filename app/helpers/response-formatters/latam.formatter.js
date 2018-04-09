/**
 * @author Sávio Muniz
 */

var Time = require('../time-utils');
var Parser = require('../parse-utils');
var CONSTANTS = require('../constants');
var cheerio = require('cheerio');

const LATAM_TEMPLATE_CHANGE_DATE = CONSTANTS.LATAM_TEMPLATE_CHANGE_DATE;

module.exports = format;

function format(redeemResponse, cashResponse, searchParams) {
    var flights = scrapHTML(cashResponse, redeemResponse, searchParams);

    var response = CONSTANTS.getBaseVoeLegalResponse(searchParams, 'latam');

    var goingStretchString = searchParams.originAirportCode + searchParams.destinationAirportCode;

    response["Trechos"][goingStretchString] = {
        "Semana" : parseWeek(flights.goingWeek),
        "Voos" : parseJSON(flights.going, searchParams, true)
    };

    if (searchParams.returnDate) {
        var comingStretchString = searchParams.destinationAirportCode + searchParams.originAirportCode;

        response["Trechos"][comingStretchString] = {
            "Semana" : parseWeek(flights.comingWeek),
            "Voos" : parseJSON(flights.coming, searchParams, false)
        };
    }

    return response;
}

function scrapHTML(cashResponse, redeemResponse, searchParams) {
    if(searchParams.returnDate) {
        var returnDate = new Date();
        returnDate.setDate(searchParams.returnDate.split('-')[2]);
        returnDate.setMonth(searchParams.returnDate.split('-')[1] - 1);
        returnDate.setFullYear(searchParams.returnDate.split('-')[0]);
    }
    else {
        var departureDate = new Date();
        departureDate.setDate(searchParams.departureDate.split('-')[2]);
        departureDate.setMonth(searchParams.departureDate.split('-')[1] - 1);
        departureDate.setFullYear(searchParams.departureDate.split('-')[0]);
    }

    var flights = null;

    if (returnDate ? returnDate < LATAM_TEMPLATE_CHANGE_DATE : departureDate <= LATAM_TEMPLATE_CHANGE_DATE)
        flights = scrapCashInfo(cashResponse, searchParams);

    else
        flights = scrapNewCashInfo(cashResponse, searchParams);

    var mileFlights = scrapRedeemInfo(redeemResponse, flights, searchParams);

    flights.going.forEach(function (flight) {
        flight.milesPrices = mileFlights.going[flight.number.slice(2,6) + flight.departureTime + flight.arrivalTime];
    });

    flights.coming.forEach(function (flight) {
        flight.milesPrices = mileFlights.coming[flight.number.slice(2,6) + flight.departureTime + flight.arrivalTime];
    });

    return flights;
}

function scrapNewCashInfo(cashResponse, searchParams) {
    var flights = {going : [], coming : [], goingWeek : {}, comingWeek : {}};

    flights.going = extractNewJSONInfo(cashResponse.going.data.flights);

    if (Object.keys(cashResponse.returning).length > 0)
        flights.coming = extractNewJSONInfo(cashResponse.returning.data.flights);

    return flights;
}

function extractNewJSONInfo(inputFlights) {
    var outputFlights = [];
    inputFlights.forEach(function (flight) {
        var outputFlight = {};

        outputFlight.number = flight.segments[0].flightCode;
        outputFlight.departureTime = flight.departure.time.stamp;
        outputFlight.departureAirport = flight.departure.airportCode;
        outputFlight.arrivalTime = flight.arrival.time.stamp;
        outputFlight.arrivalAirport = flight.arrival.airportCode;
        var duration = flight.flightDuration;
        outputFlight.duration = duration.split('H')[0].split('PT')[1] + ':' + duration.split('H')[1].split('M')[0];
        outputFlight.prices = {};
        flight.cabins[0].fares.forEach(function (fare) {
            outputFlight.prices[fare.category === 'LIGHT' ? 'light' : (fare.category === 'PLUS' ? 'plus' : 'top')] = fare.price.adult.total;
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

function scrapCashInfo(cashResponse, searchParams) {
    var $ = cheerio.load(cashResponse);

    var flights = {going : [], coming : [], goingWeek : {}, comingWeek : {}};

    //retrieve flights on going strech
    $('tbody','table.outbound.realTable.bound.family-nth3.list_flight').children().each(function () {
        var tr = $(this);

        if (extractTableInfo(tr))
            flights.going.push(extractTableInfo(tr))
    });

    //retrieve flights on returning strech
    if (searchParams.returnDate) {
        $('tbody', 'table.inbound.realTable.bound.family-nth3.list_flight').children().each(function () {
            var tr = $(this);

            if (extractTableInfo(tr))
                flights.coming.push(extractTableInfo(tr))
        });
    }

    //retrieve flights on going strech
    $('.list.caption.tc.br.calendarPricesSection.outbound').children().each(function () {
        var ul = $(this);

        if (extractWeekInfo(ul))
            flights.goingWeek[extractWeekInfo(ul).date] = {money : extractWeekInfo(ul).price};
    });

    //retrieve calendar prices
    $('.list.caption.tc.br.calendarPricesSection.inbound').children().each(function () {
        var ul = $(this);

        if (extractWeekInfo(ul))
            flights.comingWeek[extractWeekInfo(ul).date] = {money : extractWeekInfo(ul).price};
    });

    return flights;
}

function scrapRedeemInfo(redeemResponse, flights, searchParams) {
    var mileFlights = {going : {}, coming : {}};

    var $ = cheerio.load(redeemResponse);

    var tableClass = $('tbody','table.outbound.realTable.bound.family-nth2.list_flight').children().length === 0 ? 'family-nth1' : 'family-nth2';

    //same thing for redeem info
    $('tbody',`table.outbound.realTable.bound.${tableClass}.list_flight`).children().each(function () {
        var tr = $(this);

        var milesInfo = extractMilesInfo(tr);

        if(milesInfo)
            mileFlights.going[milesInfo.label] = milesInfo.price;
    });

    if (searchParams.returnDate) {
        $('tbody', `table.inbound.realTable.bound.${tableClass}.list_flight`).children().each(function () {
            var tr = $(this);

            var milesInfo = extractMilesInfo(tr);

            if(milesInfo)
                mileFlights.coming[milesInfo.label] = milesInfo.price;
        });
    }

    $('.list.caption.tc.br.calendarPricesSection.outbound').children().each(function () {
        var ul = $(this);

        if (extractWeekInfo(ul)) {
            if (flights.goingWeek[extractWeekInfo(ul).date])
                flights.goingWeek[extractWeekInfo(ul).date].miles = extractWeekInfo(ul).price;
        }
    });

    $('.list.caption.tc.br.calendarPricesSection.inbound').children().each(function () {
        var ul = $(this);

        if (extractWeekInfo(ul))
            if (flights.comingWeek[extractWeekInfo(ul).date])
                flights.comingWeek[extractWeekInfo(ul).date].miles = extractWeekInfo(ul).price;
    });

    return mileFlights;
}

function extractWeekInfo(ul) {
    if (ul.hasClass('caption'))
        return undefined;
    var day = {};
    day.price = Parser.parseLocaleStringToNumber(ul.children().find('strong').text());
    day.date = ul.attr('data-date').split(' ')[0] + "/" + Time.getLabelMonth(ul.attr('data-date').split(' ')[1]);
    return day;
}

function extractTableInfo(tr) {
    var flight = {};

    flight.number = tr.children().eq(2).find('a').attr('data-flight-number');

    if(!flight.number || !tr.hasClass('flight'))
        return undefined;

    flight.departureTime = tr.children().eq(0).find('strong').text();
    flight.departureAirport = tr.children().eq(0).find('span').text();

    flight.duration = tr.children().eq(3).text().trim();
    flight.prices = {
        light : Parser.parseLocaleStringToNumber(tr.children().eq(4).find('.price').text()),
        plus : Parser.parseLocaleStringToNumber(tr.children().eq(5).find('.price').text()),
        top : Parser.parseLocaleStringToNumber(tr.children().eq(6).find('.price').text())
    };

    if (tr.hasClass('flightType-Connection')) {
        flight.connection = [{
            departureAirport : tr.children().eq(0).find('span').text(),
            departureTime : tr.children().eq(0).find('strong').text(),
            arrivalAirport : tr.children().eq(1).find('span').text(),
            arrivalTime : tr.children().eq(1).find('strong').text(),
            flightNumber : tr.children().eq(2).find('a').attr('data-flight-number'),
            duration : tr.children().eq(3).text().trim()
        }];

        var itTrTable = tr;

        while (!itTrTable.next().hasClass('blankRow')) {
            if (itTrTable.hasClass('flightNextSegment') && itTrTable.hasClass('flightType-Connection')) {
                flight.connection.push({
                    departureAirport : itTrTable.children().eq(0).find('span').text(),
                    departureTime : itTrTable.children().eq(0).find('strong').text(),
                    arrivalAirport : itTrTable.children().eq(1).find('span').text(),
                    arrivalTime : itTrTable.children().eq(1).find('strong').text(),
                    flightNumber : itTrTable.children().eq(2).find('a').attr('data-flight-number'),
                    duration : itTrTable.children().eq(3).text().trim()
                })
            }

            if (itTrTable.hasClass('totalDurationRow') && itTrTable.hasClass('flightNextSegment')) {
                flight.duration = itTrTable.children().eq(1).text().trim();
            }

            itTrTable = itTrTable.next();
        }
    }

    if (flight.connection) {
        flight.arrivalTime = flight.connection[flight.connection.length - 1].arrivalTime;
        flight.arrivalAirport = flight.connection[flight.connection.length - 1].arrivalAirport;
    }

    else {
        flight.arrivalTime = tr.children().eq(1).find('strong').text();
        flight.arrivalAirport = tr.children().eq(1).find('span').text();
    }

    return flight;
}

function extractMilesInfo(tr) {
    var milesInfo = {};

    var flightNumber = tr.children().eq(2).find('a').attr('data-flight-number');

    if (!flightNumber || !tr.hasClass('flight'))
        return;

    var departureTime = tr.children().eq(0).find('strong').text();

    var prices = {
        classico : Parser.parseLocaleStringToNumber(tr.children().eq(4).find('.price').text()),
        irrestrito : Parser.parseLocaleStringToNumber(tr.children().eq(5).find('.price').text())
    };

    var arrivalTime = null;

    if (tr.hasClass('flightType-Connection')) {
        var itTrTable = tr;
        var quit = false;

        while (!quit) {
            if(itTrTable.next().hasClass('totalDurationRow') || itTrTable.next().hasClass('blankRowx')) {
                if (itTrTable.hasClass('flightNextSegment') && itTrTable.hasClass('flightType-Connection')) {
                    arrivalTime = itTrTable.children().eq(1).find('strong').text();
                }
                quit = true;
            }

            else
                itTrTable = itTrTable.next();
        }
    }

    else
        arrivalTime = tr.children().eq(1).find('strong').text();

    milesInfo.label = flightNumber.slice(2,6) + departureTime + arrivalTime;
    milesInfo.price = prices;

    return milesInfo;
}

function parseWeek(week) {
    var out = {};

    Object.keys(week).forEach(function (dayKey) {
        out[dayKey] = {
            Milhas : week[dayKey].miles,
            Valor : week[dayKey].money,
            Companhia : "LATAM"
        }
    });

    return out;
}

function parseJSON(flights, params, isGoing) {
    var parsed = [];
    console.log(flights);
    flights.forEach(function (flight) {
        var out = {};
        var dates = Time.getFlightDates(isGoing ? params.departureDate : params.returnDate, flight.departureTime, flight.arrivalTime);
        out.NumeroConexoes = flight.connection ? flight.connection.length - 1 : 0;
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
                outConnection.Desembarque = datesConnections.arrival + " " +connection.arrivalTime;
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
           outPrice.Adulto = flight.prices[keyPrice];
           out.Valor.push(outPrice);
        });

        out.Milhas = [];

        if (flight.milesPrices)
            Object.keys(flight.milesPrices).forEach(function (keyMilePrice) {
                var outPrice = {};
                outPrice.Bebe = 0;
                outPrice.Executivo = false;
                outPrice.TipoMilhas = keyMilePrice;
                outPrice.Adulto = flight.milesPrices[keyMilePrice];
                out.Milhas.push(outPrice)
            });

        if (isGoing)
            out.Sentido = 'ida';

        else
            out.Sentido = 'volta';

        out.Companhia = 'LATAM';

        parsed.push(out);
    });

    return parsed;
}

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