/**
 * @author Sávio Muniz
 */

const Formatter = require('../helpers/format.helper');
const CONSTANTS = require('../helpers/constants');
const validator = require('../helpers/validator');
const exception = require('../helpers/exception');
const MESSAGES = require('../helpers/messages');
const Proxy = require ('../helpers/proxy');
const { URL, URLSearchParams } = require('url');
const Keys = require('../configs/keys');
const db = require('../helpers/db-helper');

var request = Proxy.setupAndRotateRequestLib('requestretry');
const cookieJar = request.jar();

const HOST = 'https://flightavailability-green.smiles.com.br/';
const PATH = 'searchflights';


module.exports = getFlightInfo;

function getFlightInfo(req, res, next) {
    const START_TIME = (new Date()).getTime();

    try {
        request = Proxy.setupAndRotateRequestLib('requestretry');

        var searchUrl = 'https://compre2.voegol.com.br/CSearch.aspx?culture=pt-br&size=small&color=default';

        var params = {
            adults: req.query.adults,
            children: req.query.children,
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            forceCongener: false,
            infants: 0
        };

        var formData = {
            "header-chosen-origin": "",
            "destiny-hidden": false,
            "header-chosen-destiny": "",
            "goBack": "goAndBack",
            "promotional-code": "",
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$TextBoxMarketOrigin1": `(${params.originAirportCode})`,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$TextBoxMarketDestination1": `(${params.destinationAirportCode})`,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListMarketDay1": `${params.departureDate.split('-')[2]}`,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListMarketMonth1": `${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListMarketDay2": `${params.returnDate.split('-')[2]}`,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListMarketMonth2": `${params.returnDate.split('-')[0]}-${params.returnDate.split('-')[1]}`,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListPassengerType_ADT": 1,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListPassengerType_CHD": 0,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$DropDownListPassengerType_INFT": 0,
            "ControlGroupSearchView$AvailabilitySearchInputSearchView$RadioButtonMarketStructure": "RoundTrip",
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
        })
        .then(function (response) {
            console.log('...got a read');
            result = JSON.parse(response.body);
            var golResponse = {moneyResponse: null, redeemResponse: result};

            request.get({url: 'https://www.voegol.com.br/pt', jar: cookieJar, rejectUnauthorized: false}, function (err, response) {
                if (err) {
                    exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, err, response.statusCode, MESSAGES.UNREACHABLE, new Date());
                    return;
                }

                request.post({url: searchUrl, form: formData, jar: cookieJar, rejectUnauthorized: false}, function (err, response) {
                    if (err) {
                        exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, err, response.statusCode, MESSAGES.UNREACHABLE, new Date());
                        return;
                    }

                    request.get({
                        url: 'https://compre2.voegol.com.br/Select2.aspx',
                        jar: cookieJar,
                        rejectUnauthorized: false
                    }, function (err, response, body) {
                        if (err) {
                            exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, err, response.statusCode, MESSAGES.UNREACHABLE, new Date());
                            return;
                        }

                        golResponse.moneyResponse = body;

                        var formattedData = Formatter.responseFormat(golResponse.redeemResponse, golResponse.moneyResponse, params, 'gol');

                        if (formattedData.error) {
                            exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                            return;
                        }

                        if (!validator.isFlightAvailable(formattedData)) {
                            exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                            return;
                        }
                        //
                        // res.json(result);
                        res.json({results : formattedData});
                        db.saveRequest('gol', (new Date()).getTime() - START_TIME, params, null, 200, new Date());
                    });
                });

            });

            // var data = {
            //     parsed : Formatter.responseFormat(result, null, params, 'gol'),
            //     classic : result
            // };
        }, function (err) {
            exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.UNREACHABLE, new Date());
        });
    } catch (err) {
        exception.handle(res, 'gol', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.CRITICAL, new Date());
    }
}
