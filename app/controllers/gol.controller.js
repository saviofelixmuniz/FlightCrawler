/**
 * @author Sávio Muniz
 */

const Formatter = require('../helpers/format.helper');
const CONSTANTS = require('../helpers/constants');
const validator = require('../helpers/validator');
const exception = require('../helpers/exception');
const MESSAGES = require('../helpers/messages');
const Proxy = require ('../helpers/proxy');
const Keys = require('../configs/keys');
const db = require('../helpers/db-helper');
var golAirport = require('../helpers/airports-data').getGolAirport;
var smilesAirport = require('../helpers/airports-data').getSmilesAirport;
var request = Proxy.setupAndRotateRequestLib('requestretry', 'gol');
var rp = Proxy.setupAndRotateRequestLib('request-promise', 'gol');
const cookieJar = request.jar();

const HOST = 'https://flightavailability-prd.smiles.com.br';
const PATH = 'searchflights';


module.exports = getFlightInfo;

async function getFlightInfo(req, res, next) {
    const START_TIME = (new Date()).getTime();

    console.log('Searching Gol...');
    try {
        var searchUrl = 'https://compre2.voegol.com.br/CSearch.aspx?culture=pt-br&size=small&color=default';

        var params = {
            IP: req.clientIp,
            adults: req.query.adults,
            children: req.query.children ? req.query.children : '0',
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate ? req.query.returnDate : null,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            forceCongener: 'false',
            originCountry: req.query.originCountry || 'BR',
            destinationCountry: req.query.destinationCountry || 'BR',
            infants: 0
        };

        var cached = await db.getCachedResponse(params, new Date(), 'gol');
        if (cached) {
            db.saveRequest('gol', (new Date()).getTime() - START_TIME, params, null, 200, null);
            res.status(200);
            res.json({results: cached});
            return;
        }

        if (!smilesAirport(params.originAirportCode) || !smilesAirport(params.destinationAirportCode)) {
            exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, null, 404, MESSAGES.NO_AIRPORT, new Date());
            return;
        }

        var formData = {
            "header-chosen-origin": "",
            "destiny-hidden": 'false',
            "header-chosen-destiny": "",
            "goBack": params.returnDate ? "goAndBack" : "goOrBack",
            "promotional-code": "",
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$TextBoxMarketOrigin1": `${params.originAirportCode}`,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$TextBoxMarketDestination1": `${params.destinationAirportCode}`,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListMarketDay1": `${params.departureDate.split('-')[2]}`,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListMarketMonth1": `${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListMarketDay2": params.returnDate ? params.returnDate.split('-')[2] : '17',
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListMarketMonth2": params.returnDate ? `${params.returnDate.split('-')[0]}-${params.returnDate.split('-')[1]}` : '2018-08',
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListPassengerType_ADT": 1,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListPassengerType_CHD": params.children ? params.children : 0,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListPassengerType_INFT": 0,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$RadioButtonMarketStructure": params.returnDate ? "RoundTrip" : 'OneWay',
            "PageFooter_SearchView$DropDownListOriginCountry": "pt",
            "ControlGroupSearchView$ButtonSubmit": "compre aqui",
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListResidentCountry": "br",
            "SmilesAndMoney": "False",
            "__EVENTARGUMENT": "",
            "__EVENTTARGET": "",
            "size": "small"
        };

        var result = null;

        request.get({
            url: Formatter.urlFormat(HOST, PATH, params),
            headers: {
                'x-api-key': Keys.golApiKey
            },
            maxAttempts: 3,
            retryDelay: 150
        }).then(async function (response) {
            console.log('GOL:  ...got redeem read');
            result = JSON.parse(response.body);

            if (params.international) {
                params.forceCongener = 'true';
                var congenerFlights = JSON.parse(await rp.get({
                    url: Formatter.urlFormat(HOST, PATH, params),
                    headers: {
                        'x-api-key': Keys.golApiKey
                    },
                    maxAttempts: 3,
                    retryDelay: 150
                }))["requestedFlightSegmentList"][0]["flightList"];
                debugger;
                var golFlights = result["requestedFlightSegmentList"][0]["flightList"];
                golFlights = golFlights.concat(congenerFlights);
                result["requestedFlightSegmentList"][0]["flightList"] = golFlights;
                console.log('GOL:  ...got congener redeem read');
            }

            var golResponse = {moneyResponse: null, redeemResponse: result};

            request.get({
                url: 'https://www.voegol.com.br/pt',
                jar: cookieJar,
                rejectUnauthorized: false
            }, function (err, response) {
                console.log('GOL:  ...got landing page read');
                if (err) {
                    exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, err, 500, MESSAGES.UNREACHABLE, new Date());
                    return;
                }

                request.post({
                    url: searchUrl,
                    form: formData,
                    jar: cookieJar,
                    rejectUnauthorized: false
                }, function (err, response) {
                    console.log('GOL:  ...made redeem post');
                    if (err) {
                        exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, err, 500, MESSAGES.UNREACHABLE, new Date());
                        return;
                    }

                    if (golAirport(params.originAirportCode) && golAirport(params.destinationAirportCode)) {
                        request.get({
                            url: 'https://compre2.voegol.com.br/Select2.aspx',
                            jar: cookieJar,
                            rejectUnauthorized: false
                        }, async function the(err, response, body) {
                            console.log('GOL:  ...got cash read');
                            if (err) {
                                exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, err, 500, MESSAGES.UNREACHABLE, new Date());
                                return;
                            }

                            golResponse.moneyResponse = body;

                            Formatter.responseFormat(golResponse.redeemResponse, golResponse.moneyResponse, params, 'gol').then(function (formattedData) {
                                if (formattedData.error) {
                                    exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                                    return;
                                }

                                if (!validator.isFlightAvailable(formattedData)) {
                                    exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                                    return;
                                }

                                res.json({results: formattedData});
                                db.saveRequest('gol', (new Date()).getTime() - START_TIME, params, null, 200, formattedData);
                            }, function (err) {
                                throw err;
                            });
                        });
                    }
                    else {
                        Formatter.responseFormat(golResponse.redeemResponse, null, params, 'gol').then(function (formattedData) {
                            if (formattedData.error) {
                                exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                                return;
                            }

                            if (!validator.isFlightAvailable(formattedData)) {
                                exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                                return;
                            }

                            res.json({results: formattedData});
                            db.saveRequest('gol', (new Date()).getTime() - START_TIME, params, null, 200, formattedData);
                        }, function (err) {
                            throw err;
                        });
                    }
                });
            });
        }, function (err) {
            exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.UNREACHABLE, new Date());
        });
    } catch (err) {
        exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.CRITICAL, new Date());
    }
}
