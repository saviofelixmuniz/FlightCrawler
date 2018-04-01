/**
 * @author Sávio Muniz
 */

const request = require('requestretry');
const Formatter = require('../helpers/format.helper');
const Validater = require('../helpers/validater.helper')
const { URL, URLSearchParams } = require('url');
const Keys = require('../configs/keys');
const cookieJar = request.jar();

const HOST = 'https://flightavailability-green.smiles.com.br/';
const PATH = 'searchflights';


module.exports = getFlightInfo;

function getFlightInfo(req, res, next) {
    var validationResult = Validater.validateFlightQuery(req.query);
    var searchUrl = 'https://compre2.voegol.com.br/CSearch.aspx?culture=pt-br&size=small&color=default';

    if (validationResult.error) {
        res.status(415);
        res.json({ error: validationResult.error });
        return;
    }

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

            var golResponse = { moneyResponse: null, redeemResponse: result };
            request.get({ url: 'https://www.voegol.com.br/pt', jar: cookieJar }, function () {

                request.post({ url: searchUrl, form: formData, jar: cookieJar }, function () {
                    request.get({ url: 'https://compre2.voegol.com.br/Select2.aspx', jar: cookieJar }, function (err, response, body) {
                        golResponse.moneyResponse = body;
                        var formattedData = Formatter.responseFormat(golResponse.redeemResponse,
                            golResponse.moneyResponse, params, 'gol');

                        res.json(formattedData);
                        
                      
                    });
                });

            });

            // var data = {
            //     parsed : Formatter.responseFormat(result, null, params, 'gol'),
            //     classic : result
            // };
        }, function (error) {
            result = error;
            return result;
        });


    //res.json(result);
}
