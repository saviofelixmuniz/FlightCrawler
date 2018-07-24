const Proxy = require ('../../services/proxy');
const Parser = require('../../helpers/parse-utils');
const Formatter = require('../../helpers/format.helper');
const Airports = require('../../../db/models/airports');
const Keys = require('../../../configs/keys');
let cheerio = require('cheerio');

let aviancaRequest = Proxy.setupAndRotateRequestLib('request', 'avianca');
let golRequest = Proxy.setupAndRotateRequestLib('requestretry', 'gol');
let azulRequest = Proxy.setupAndRotateRequestLib('request-promise', 'azul');
let latamRequest = Proxy.setupAndRotateRequestLib('request-promise', 'latam');
const DEFAULT_DEST_AIRPORT = 'SAO';
const DEFAULT_INTERVAL = 14;

function getDefaultInternaval(international) {
    return international ? 60 : DEFAULT_INTERVAL;
}

function getDefaultDestAirport (originAirport, international, company) {
    if (international) {
        return company === 'azul' ? 'EZE' : 'NYC';
    }
    else if (originAirport === 'GRU' || originAirport === 'CGH' || originAirport === 'VCP') {
        return 'RIO';
    }
    return DEFAULT_DEST_AIRPORT;
}

exports.crawlTax = async function (airportCode, company, requestedByUser, international) {
    return {'latam': getTaxFromLatam,
            'azul': getTaxFromAzul,
            'gol': getTaxFromGol,
            'avianca': getTaxFromAvianca}[company](airportCode, international).then(function (tax) {
                if (tax) {
                    let updateObj = {
                        code: airportCode,
                        tax: tax,
                        updated_at: new Date(),
                        company: company,
                        international: international
                    };

                    if (requestedByUser)
                        updateObj['searched_at'] = new Date();

                    return Airports.update({code: airportCode, company: company},
                        updateObj, {upsert: true}).then(function () {
                            return tax;
                        }
                    );
                }
    });
    };

async function getTaxFromAvianca (airportCode, international) {
    return new Promise((resolve) => {
        try {
            console.log(`TAX AVIANCA:   ...retrieving ${airportCode} tax`);
            let cookieJar = aviancaRequest.jar();
            let tokenUrl = 'https://www.pontosamigo.com.br/api/jsonws/aviancaservice.tokenasl/get-application-token';
            aviancaRequest.get({url: tokenUrl, jar: cookieJar}, function (err, response) {
                if (err) {
                    return resolve(null);
                }

                let token = JSON.parse(response.body).accessToken;

                let tripFlowUrl = 'https://api.avianca.com.br/farecommercialization/generateurl/' +
                    `ORG=${airportCode}&DST=${getDefaultDestAirport(airportCode, international, 'avianca')}` +
                    `&OUT_DATE=${formatDateAvianca(getDateString(false, international))}&LANG=BR` +
                    `&COUNTRY=BR&QT_ADT=1&QT_CHD=0&QT_INF=0&FLX_DATES=true` +
                    `&CABIN=Economy` +
                    `&SOURCE=DESKTOP_REVENUE&MILES_MODE=TRUE?access_token=${token}`;

                aviancaRequest.get({url: tripFlowUrl, jar: cookieJar}, function (err, response) {
                    if (err) {
                        return resolve(null);
                    }

                    let parsedBody = JSON.parse(response.body);
                    if (parsedBody.payload) {
                        let mainUrl = parsedBody.payload.url;
                    }
                    else {
                        return resolve(null);
                    }

                    aviancaRequest.post({url: mainUrl, jar: cookieJar}, function (err, response, body) {
                        try {
                            let parsed = Formatter.parseAviancaResponse(body);
                        } catch (e) {
                            return resolve(null);
                        }
                        let recoList = parsed['pageDefinitionConfig']['pageData']['business']['Availability']['recommendationList'];
                        if (!recoList || recoList.length < 0) return resolve(null);
                        let recoFlight = recoList[0];
                        console.log(`TAX AVIANCA:   ...retrieved tax successfully`);
                        return resolve(recoFlight.bounds.length > 1 ? recoFlight.bounds[0].boundAmount.tax : recoFlight.recoAmount.tax);
                    });
                });
            });
        } catch (e) {
            return resolve(null);
        }
    });
}

async function getTaxFromGol (airportCode, international) {
    return new Promise((resolve) => {
        try {
            console.log(`TAX GOL:   ...retrieving ${airportCode} tax`);
            const HOST = 'https://flightavailability-prd.smiles.com.br';
            const PATH = 'searchflights';
            debugger;

            let date = getDateString(false, international);
            let returnDate = getDateString(true, international);

            let params = {
                adults: '1',
                children: '0',
                departureDate: date,
                returnDate: returnDate,
                originAirportCode: airportCode,
                destinationAirportCode: getDefaultDestAirport(airportCode, international, 'gol'),
                forceCongener: international,
                infants: 0
            };

            let result = null;

            golRequest.get({
                url: Formatter.urlFormat(HOST, PATH, params),
                headers: {
                    'x-api-key': Keys.golApiKey
                },
                maxAttempts: 3,
                retryDelay: 150
            })
                .then(function (response) {
                    result = JSON.parse(response.body);
                    let flightList = result["requestedFlightSegmentList"][0]["flightList"];
                    if (!flightList || flightList.length < 0) return resolve(null);
                    let flight = flightList[0];
                    debugger;

                    golRequest.get({
                        url: `https://flightavailability-prd.smiles.com.br/getboardingtax?adults=1&children=0&fareuid=${flight.fareList[0].uid}&infants=0&type=SEGMENT_1&uid=${flight.uid}`,
                        headers: {'x-api-key': Keys.golApiKey}
                    }).then(function (response) {
                        let airportTaxes = JSON.parse(response.body);
                        if (!airportTaxes) {
                            return resolve(null);
                        }
                        console.log(`TAX GOL:   ...retrieved tax successfully`);
                        return resolve(airportTaxes.totals.total.money);
                    }).catch(function (err) {
                        return resolve(null);
                    });
                }, function (err) {
                    return resolve(null);
                });
            } catch (e) {
            return resolve(null);
        }
    });
}

async function getTaxFromLatam (airportCode, international) {
    return new Promise((resolve) => {
            console.log(`TAX LATAM:   ...retrieving ${airportCode} tax`);
            let url = `https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/revenue/
                       recommendations/oneway?country=BR&language=PT&
                       home=pt_br&origin=${airportCode}&destination=${getDefaultDestAirport(airportCode, international, 'latam')}&
                       departure=${getDateString(false, international)}&adult=1&cabin=Y`.replace(/\s+/g, '');

            latamRequest.get({url: url}).then(function (res) {
                res = JSON.parse(res);
                let possibleTaxesArray = [];
                for (let flight of res.data.flights) {
                    possibleTaxesArray.push(flight.cabins[0].fares[0].price.adult.taxAndFees)
                }
                let set = new Set(possibleTaxesArray);
                possibleTaxesArray = Array.from(set);
                possibleTaxesArray.sort();
                let tax = possibleTaxesArray[possibleTaxesArray.length - 1];

                console.log(`TAX LATAM:   ...retrieved tax successfully`);
                return resolve(tax);
            });
    });
}

async function getTaxFromAzul (airportCode, international) {
    return new Promise((resolve) => {
        console.log(`TAX AZUL:   ...retrieving ${airportCode} tax`);
        let params = {
            adults: '1',
            children: '0',
            departureDate: getDateString(false, international),
            returnDate: getDateString(true, international),
            originAirportCode: airportCode,
            destinationAirportCode: getDefaultDestAirport(airportCode, international, 'azul')
        };

        let jar = azulRequest.jar();

        let formData = Formatter.formatAzulForm(params, true);
        let headers = Formatter.formatAzulHeaders(formData);

        azulRequest.post({ url: 'https://viajemais.voeazul.com.br/Search.aspx', form: formData, headers: headers, jar: jar }).then(function () {
            azulRequest.get({ url: 'https://viajemais.voeazul.com.br/Availability.aspx', jar: jar }).then(function (body) {
                let $ = cheerio.load(body);

                let infoButton = $('tbody', 'table.tbl-flight-details.tbl-depart-flights').children().eq(0).children().eq(0).find('.flight').find('span').find('button')[0].attribs;
                let flightCode = $('tbody', 'table.tbl-flight-details.tbl-depart-flights').children().eq(0).children().eq(1).find('input').attr('value');

                let urlFormatted = 'https://viajemais.voeazul.com.br/SelectPriceBreakDownAjax.aspx?';

                let STDIda = '';
                let departureTimes = infoButton.departuretime.split(',');

                departureTimes.forEach(function (departure, index) {
                    STDIda += (getDateString(false, international) + " " + departure + ":00");
                    if (index !== departureTimes.length - 1)
                        STDIda += "|"
                });

                let requestQueryParams = {
                    'SellKeyIda': flightCode,
                    'SellKeyVolta': '',
                    'QtdInstallments': '1',
                    'TawsIdIda': 'undefined',
                    'TawsIdVolta': '',
                    'IsBusinessTawsIda': '',
                    'IsBusinessTawsVolta': '',
                    'DepartureIda': infoButton.departure,
                    'DepartureTimeIda': infoButton.departuretime,
                    'ArrivalIda': infoButton.arrival,
                    'ArrivalTimeIda': infoButton.arrivaltime,
                    'DepartureVolta': '',
                    'DepartureTimeVolta': '',
                    'ArrivalVolta': '',
                    'ArrivalTimeVolta': '',
                    'FlightNumberIda': infoButton.flightnumber,
                    'FlightNumberVolta': '',
                    'CarrierCodeIda': infoButton.carriercode,
                    'CarrierCodeVolta': '',
                    'STDIda': STDIda,
                    'STDVolta': ''
                };

                Object.keys(requestQueryParams).forEach(function (param, index) {
                    urlFormatted += param + "=" + requestQueryParams[param];
                    if (index !== Object.keys(requestQueryParams).length - 1) {
                        urlFormatted += "&";
                    }
                });

                urlFormatted = urlFormatted.replace(/\s/g, '%20');

                azulRequest.get({'url': urlFormatted, 'jar': jar}).then(function (taxHTML) {
                    let $ = cheerio.load(taxHTML);
                    let strValue = $('#tip-taxes').find('.value').children().eq(1).text();
                    let tax = Parser.parseLocaleStringToNumber(strValue);

                    console.log(`TAX AZUL:   ...retrieved tax successfully`);
                    return resolve(tax);
                }).catch(function (err) {
                     return resolve(null);
                });
            }).catch(function (err) {
                return resolve(null);
            });
        }).catch(function (err) {
            return resolve(null);
        });
    });
}

function getDateString(returnDate, international) {
    let date = new Date();
    debugger;
    date.setDate(date.getDate() + getDefaultInternaval(international));
    if (returnDate)
        date.setDate(date.getDate() + 60);
    let mm = date.getMonth() + 1;
    let dd = date.getDate();

    return [date.getFullYear(),
        (mm>9 ? '' : '0') + mm,
        (dd>9 ? '' : '0') + dd
    ].join('-');
}

function formatDateAvianca(date) {
    let splitDate = date.split('-');
    return splitDate[0] + splitDate[1] + splitDate[2];
}

