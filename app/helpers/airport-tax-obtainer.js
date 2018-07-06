
const Proxy = require ('./proxy');
const Formatter = require('./format.helper');
const Keys = require('../configs/keys');
const AzulFormatter = require('./response-formatters/azul.formatter');

var aviancaRequest = Proxy.setupAndRotateRequestLib('request', 'avianca');
var golRequest = Proxy.setupAndRotateRequestLib('requestretry', 'gol');
const defaultDestAirport = 'SAO';

exports.getTaxFromAvianca = async function (airportCode) {
    return new Promise((resolve) => {
        try {
            var cookieJar = aviancaRequest.jar();
            var tokenUrl = 'https://www.pontosamigo.com.br/api/jsonws/aviancaservice.tokenasl/get-application-token';
            aviancaRequest.get({url: tokenUrl, jar: cookieJar}, function (err, response) {
                if (err) {
                    return resolve(null);
                }
                console.log('AVIANCA:  ...got app token');
                var token = JSON.parse(response.body).accessToken;

                var tripFlowUrl = 'https://api.avianca.com.br/farecommercialization/generateurl/' +
                    `ORG=${airportCode}&DST=${defaultDestAirport}` +
                    `&OUT_DATE=${formatDateAvianca(getDateString())}&LANG=BR` +
                    `&COUNTRY=BR&QT_ADT=1&QT_CHD=0&QT_INF=0&FLX_DATES=true` +
                    `&CABIN=Economy` +
                    `&SOURCE=DESKTOP_REVENUE&MILES_MODE=TRUE?access_token=${token}`;

                aviancaRequest.get({url: tripFlowUrl, jar: cookieJar}, function (err, response) {
                    if (err) {
                        return resolve(null);
                    }
                    console.log('AVIANCA:  ...got api url response');

                    var parsedBody = JSON.parse(response.body);
                    if (parsedBody.payload) {
                        var mainUrl = parsedBody.payload.url;
                    }
                    else {
                        return resolve(null);
                    }

                    aviancaRequest.post({url: mainUrl, jar: cookieJar}, function (err, response, body) {
                        console.log('AVIANCA:  ...got api response');
                        try {
                            var parsed = Formatter.parseAviancaResponse(body);
                        } catch (e) {
                            return resolve(null);
                        }
                        var recoList = parsed['pageDefinitionConfig']['pageData']['business']['Availability']['recommendationList'];
                        if (!recoList || recoList.length < 0) return resolve(null);
                        var recoFlight = recoList[0];
                        return resolve(recoFlight.bounds.length > 1 ? recoFlight.bounds[0].boundAmount.tax : recoFlight.recoAmount.tax);
                    });
                });
            });
        } catch (e) {
            return resolve(null);
        }
    });
};

exports.getTaxFromGol = async function (airportCode) {
    return new Promise((resolve) => {
        try {
            const HOST = 'https://flightavailability-prd.smiles.com.br';
            const PATH = 'searchflights';
            var cookieJar = golRequest.jar();

            var date = getDateString();
            var returnDate = getDateString(true);

            var params = {
                adults: '1',
                children: '0',
                departureDate: date,
                returnDate: returnDate,
                originAirportCode: airportCode,
                destinationAirportCode: defaultDestAirport,
                forceCongener: 'false',
                infants: 0
            };

            var result = null;

            golRequest.get({
                url: Formatter.urlFormat(HOST, PATH, params),
                headers: {
                    'x-api-key': Keys.golApiKey
                },
                maxAttempts: 3,
                retryDelay: 150
            })
                .then(function (response) {
                    console.log('GOL:  ...got redeem read');
                    result = JSON.parse(response.body);
                    var flightList = result["requestedFlightSegmentList"][0]["flightList"];
                    if (!flightList || flightList.length < 0) return resolve(null);
                    var flight = flightList[0];

                    console.log(`Trying to get ${flight["departure"]["airport"]["code"]} tax from Gol...`);
                    golRequest.get({
                        url: `https://flightavailability-prd.smiles.com.br/getboardingtax?adults=1&children=0&fareuid=${flight.fareList[0].uid}&infants=0&type=SEGMENT_1&uid=${flight.uid}`,
                        headers: {'x-api-key': Keys.golApiKey}
                    }).then(function (response) {
                        debugger;
                        var airportTaxes = JSON.parse(response.body);
                        if (!airportTaxes) {
                            return resolve(null);
                        }
                        console.log(`...Got ${flight["departure"]["airport"]["code"]} tax from Gol!`);
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
};

function getDateString(returnDate) {
    var date = new Date();
    date.setDate(date.getDate() + 30);
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