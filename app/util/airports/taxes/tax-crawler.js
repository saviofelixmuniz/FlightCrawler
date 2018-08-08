const Proxy = require ('../../services/proxy');
const Parser = require('../../helpers/parse-utils');
const Formatter = require('../../helpers/format.helper');
const Airports = require('../../../db/models/airports');
const Keys = require('../../../configs/keys');
var cheerio = require('cheerio');
var exif = require('exif');
const util = require('util');

const DEFAULT_DEST_AIRPORT = 'SAO';
const DEFAULT_INTERVAL = 14;

function getDefaultInternaval(international, secondTry) {
    return secondTry ? (international ? 60 : DEFAULT_INTERVAL) + 30 : (international ? 60 : DEFAULT_INTERVAL);
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

exports.crawlTax = async function (airportCode, company, requestedByUser, international, secondTry) {
    return {'latam': getTaxFromLatam,
            'azul': getTaxFromAzul,
            'gol': getTaxFromGol,
            'avianca': getTaxFromAvianca}[company](airportCode, international, secondTry).then(function (tax) {
                if (tax) {
                    var updateObj = {
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

async function getTaxFromAvianca (airportCode, international, secondTry) {
    return new Promise((resolve) => {
        var aviancaRequest = Proxy.setupAndRotateRequestLib('request', 'avianca');
        try {
            console.log(`TAX AVIANCA:   ...retrieving ${airportCode} tax`);
            var cookieJar = aviancaRequest.jar();
            var tokenUrl = 'https://www.pontosamigo.com.br/api/jsonws/aviancaservice.tokenasl/get-application-token';
            aviancaRequest.get({url: tokenUrl, jar: cookieJar}, function (err, response) {
                if (err) {
                    return resolve(null);
                }

                var token = JSON.parse(response.body).accessToken;

                var tripFlowUrl = 'https://api.avianca.com.br/farecommercialization/generateurl/' +
                    `ORG=${airportCode}&DST=${getDefaultDestAirport(airportCode, international, 'avianca')}` +
                    `&OUT_DATE=${formatDateAvianca(getDateString(false, international, secondTry))}&LANG=BR` +
                    `&COUNTRY=BR&QT_ADT=1&QT_CHD=0&QT_INF=0&FLX_DATES=true` +
                    `&CABIN=Economy` +
                    `&SOURCE=DESKTOP_REVENUE&MILES_MODE=TRUE?access_token=${token}`;

                aviancaRequest.get({url: tripFlowUrl, jar: cookieJar}, function (err, response) {
                    if (err) {
                        return resolve(null);
                    }

                    var parsedBody = JSON.parse(response.body);
                    var mainUrl = undefined;
                    if (parsedBody.payload) {mainUrl = parsedBody.payload.url;
                    }
                    else {
                        return resolve(null);
                    }

                    aviancaRequest.post({url: mainUrl, jar: cookieJar}, function (err, response, body) {
                        try {
                            var parsed = Formatter.parseAviancaResponse(body);
                        } catch (e) {
                            return resolve(null);
                        }
                        var recoList = parsed['pageDefinitionConfig']['pageData']['business']['Availability']['recommendationList'];
                        if (!recoList || recoList.length < 0) return resolve(null);
                        var recoFlight = recoList[0];
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

async function getTaxFromGol (airportCode, international, secondTry) {
    return new Promise((resolve) => {
        try {
            var golRequest = Proxy.setupAndRotateRequestLib('request-promise', 'gol');
            console.log(`TAX GOL:   ...retrieving ${airportCode} tax`);
            const HOST = 'https://flightavailability-prd.smiles.com.br';
            const PATH = 'searchflights';
            const exifPromise = util.promisify(exif);

            var date = getDateString(false, international, secondTry);
            var returnDate = getDateString(true, international, secondTry);

            var params = {
                adults: '1',
                children: '0',
                departureDate: date,
                returnDate: returnDate,
                originAirportCode: airportCode,
                destinationAirportCode: getDefaultDestAirport(airportCode, international, 'gol'),
                forceCongener: international,
                infants: 0
            };

            var result = null;

            var referer = Formatter.formatSmilesUrl(params);
            var cookieJar = golRequest.jar();

            return golRequest.get({url: 'https://www.smiles.com.br/home', jar: cookieJar}).then(function () {
                return golRequest.get({url: referer, headers: {"user-agent": "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36"}, jar: cookieJar}).then(async function (body) {
                    var $ = cheerio.load(body);
                    var image = $('#customDynamicLoading').attr('src').split('base64,')[1];
                    var buffer = Buffer.from(image, 'base64');
                    var obj = await exifPromise(buffer);
                    var strackId = Formatter.batos(obj.image.XPTitle) + Formatter.batos(obj.image.XPAuthor) +
                        Formatter.batos(obj.image.XPSubject) + Formatter.batos(obj.image.XPComment);

                    console.log('... got strack id: ' + strackId);

                    var headers = {
                        "user-agent": "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36",
                        "x-api-key": Keys.golApiKey,
                        "referer": referer,
                        "x-strackid": strackId
                    };

                    var url = Formatter.formatSmilesFlightsApiUrl(params);

                    return golRequest.get({
                        url: url,
                        headers: headers,
                        jar: cookieJar
                    }).then(function (response) {
                        var result = JSON.parse(response);
                        var flightList = result["requestedFlightSegmentList"][0]["flightList"];
                        if (!flightList || flightList.length < 0) return resolve(null);
                        var flight = flightList[0];
                        golRequest.get({
                            url: `https://flightavailability-prd.smiles.com.br/getboardingtax?adults=1&children=0&fareuid=${flight.fareList[0].uid}&infants=0&type=SEGMENT_1&uid=${flight.uid}`,
                            headers: headers,
                            jar: cookieJar
                        }).then(function (response) {
                            var airportTaxes = JSON.parse(response);
                            if (!airportTaxes) {
                                return resolve(null);
                            }
                            console.log(`TAX GOL:   ...retrieved tax successfully`);
                            return resolve(airportTaxes.totals.total.money);
                        }).catch(function (err) {
                            return resolve(null);
                        });
                    }).catch(function (err) {
                        return resolve(null);
                    });
                }).catch(function (err) {
                    return resolve(null);
                });
            }).catch (function (err) {
                return resolve(null);
            });
        } catch (e) {
            return resolve(null);
        }
    });
}

async function getTaxFromLatam (airportCode, international, secondTry) {
    return new Promise((resolve) => {
        var latamRequest = Proxy.setupAndRotateRequestLib('request-promise', 'latam');
        console.log(`TAX LATAM:   ...retrieving ${airportCode} tax`);
        var url = `https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/revenue/
                   recommendations/oneway?country=BR&language=PT&
                   home=pt_br&origin=${airportCode}&destination=${getDefaultDestAirport(airportCode, international, 'latam')}&
                   departure=${getDateString(false, international, secondTry)}&adult=1&cabin=Y`.replace(/\s+/g, '');

        latamRequest.get({url: url}).then(function (res) {
            res = JSON.parse(res);
            var possibleTaxesArray = [];
            for (var flight of res.data.flights) {
                possibleTaxesArray.push(flight.cabins[0].fares[0].price.adult.taxAndFees)
            }
            var set = new Set(possibleTaxesArray);
            possibleTaxesArray = Array.from(set);
            possibleTaxesArray.sort();
            var tax = possibleTaxesArray[possibleTaxesArray.length - 1];

            console.log(`TAX LATAM:   ...retrieved tax successfully`);
            return resolve(tax);
        });
    });
}

async function getTaxFromAzul (airportCode, international, secondTry) {
    return new Promise((resolve) => {
        var azulRequest = Proxy.setupAndRotateRequestLib('request-promise', 'azul');
        console.log(`TAX AZUL:   ...retrieving ${airportCode} tax`);
        var params = {
            adults: '1',
            children: '0',
            departureDate: getDateString(false, international, secondTry),
            returnDate: getDateString(true, international, secondTry),
            originAirportCode: airportCode,
            destinationAirportCode: getDefaultDestAirport(airportCode, international, 'azul')
        };

        var jar = azulRequest.jar();

        var formData = Formatter.formatAzulForm(params, true);
        var headers = Formatter.formatAzulHeaders(formData);

        azulRequest.post({ url: 'https://viajemais.voeazul.com.br/Search.aspx', form: formData, headers: headers, jar: jar }).then(function () {
            azulRequest.get({ url: 'https://viajemais.voeazul.com.br/Availability.aspx', jar: jar }).then(function (body) {
                var $ = cheerio.load(body);

                var infoButton = $('tbody', 'table.tbl-flight-details.tbl-depart-flights').children().eq(0).children().eq(0).find('.flight').find('span').find('button')[0].attribs;
                var flightCode = $('tbody', 'table.tbl-flight-details.tbl-depart-flights').children().eq(0).children().eq(1).find('input').attr('value');

                var urlFormatted = 'https://viajemais.voeazul.com.br/SelectPriceBreakDownAjax.aspx?';

                var STDIda = '';
                var departureTimes = infoButton.departuretime.split(',');

                departureTimes.forEach(function (departure, index) {
                    STDIda += (getDateString(false, international, secondTry) + " " + departure + ":00");
                    if (index !== departureTimes.length - 1)
                        STDIda += "|"
                });

                var requestQueryParams = {
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
                    var $ = cheerio.load(taxHTML);
                    var strValue = $('#tip-taxes').find('.value').children().eq(1).text();
                    var tax = Parser.parseLocaleStringToNumber(strValue);

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

function getDateString(returnDate, international, secondTry) {
    var date = new Date();
    date.setDate(date.getDate() + getDefaultInternaval(international, secondTry));
    if (returnDate)
        date.setDate(date.getDate() + 60);
    var mm = date.getMonth() + 1;
    var dd = date.getDate();

    return [date.getFullYear(),
        (mm>9 ? '' : '0') + mm,
        (dd>9 ? '' : '0') + dd
    ].join('-');
}

function formatDateAvianca(date) {
    var splitDate = date.split('-');
    return splitDate[0] + splitDate[1] + splitDate[2];
}

