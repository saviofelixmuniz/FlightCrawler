/**
 * @author Sávio Muniz
 */

const Formatter = require('../helpers/format.helper');
const validator = require('../helpers/validator');
const exception = require('../helpers/exception');
const MESSAGES = require('../helpers/messages');
const Proxy = require ('../helpers/proxy');
const Keys = require('../configs/keys');
const db = require('../helpers/db-helper');
var exif = require('exif2');
var cheerio = require('cheerio');
var golAirport = require('../helpers/airports-data').getGolAirport;
var smilesAirport = require('../helpers/airports-data').getSmilesAirport;
const util = require('util');

const HOST = 'https://flightavailability-prd.smiles.com.br';
const PATH = 'searchflights';


module.exports = getFlightInfo;

async function getFlightInfo(req, res, next) {
    const startTime = (new Date()).getTime();

    console.log('Searching Gol...');
    try {

        var params = {
            IP: req.clientIp,
            api_key: req.headers['authorization'],
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
            var request = await db.saveRequest('gol', (new Date()).getTime() - startTime, params, null, 200, null);
            var cachedId = cached.id;
            delete cached.id;
            res.status(200);
            res.json({results: cached, cached: cachedId, id: request._id});
            return;
        }

        var golResponse = await makeRequests(params, startTime, res);
        if (!golResponse || !golResponse.redeemResponse || !golResponse.moneyResponse) return;

        Formatter.responseFormat(golResponse.redeemResponse, golResponse.moneyResponse, params, 'gol').then(async function (formattedData) {
            if (formattedData.error) {
                exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, formattedData.error, 400, MESSAGES.PARSE_ERROR, new Date());
                return;
            }

            if (!validator.isFlightAvailable(formattedData)) {
                exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                return;
            }

            var request = await db.saveRequest('gol', (new Date()).getTime() - startTime, params, null, 200, formattedData);
            res.status(200);
            res.json({results: formattedData, id: request._id});
        }, function (err) {
            throw err;
        });

    } catch (err) {
        exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, err, 400, MESSAGES.CRITICAL, new Date());
    }
}

function makeRequests(params, startTime, res) {
    return Promise.all([getCashResponse(params, startTime, res), getRedeemResponse(params, startTime, res)]).then(function (results) {
        if (results[0].err) {
            exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, results[0].err, results[0].code, results[0].message, new Date());
            return null;
        }
        if (results[1].err) {
            exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, results[1].err, results[1].code, results[1].message, new Date());
            return null;
        }
        return {moneyResponse: results[0], redeemResponse: results[1]};
    });
}

function getCashResponse(params, startTime, res) {
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'gol');
    var cookieJar = request.jar();

    var searchUrl = 'https://compre2.voegol.com.br/CSearch.aspx?culture=pt-br&size=small&color=default';

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

    return request.post({
        url: searchUrl,
        form: formData,
        jar: cookieJar,
        rejectUnauthorized: false
    }).then(function () {
        console.log('GOL:  ...made redeem post');

        if (golAirport(params.originAirportCode) && golAirport(params.destinationAirportCode)) {
            return request.get({
                url: 'https://compre2.voegol.com.br/Select2.aspx',
                jar: cookieJar,
                rejectUnauthorized: false
            }).then(function (body) {
                console.log('GOL:  ...got cash read');

                return body;
            }).catch(function (err) {
                exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, err, 500, MESSAGES.UNREACHABLE, new Date());
            });
        }

        else
            return null;
    }).catch(function(err) {
        exception.handle(res, 'gol', (new Date()).getTime() - startTime, params, err, 500, MESSAGES.UNREACHABLE, new Date());
    });
}

function getRedeemResponse(params, startTime, res) {
    // var request = Proxy.setupAndRotateRequestLib('request-promise', 'gol');
    var request = require('request-promise');
    const exifPromise = util.promisify(exif);

    if (!smilesAirport(params.originAirportCode) || !smilesAirport(params.destinationAirportCode)) {
        return {err: true, code: 404, message: MESSAGES.NO_AIRPORT};
    }

    var referer = formatUrl(params);
    console.log(referer);
    var cookieJar = request.jar();

    return request.get({url: 'https://www.smiles.com.br/home', jar: cookieJar}).then(function () {
        return request.get({url: referer, headers: {"user-agent": "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36"}, jar: cookieJar}).then(async function (body) {
            console.log('... got html page');
            var $ = cheerio.load(body);

            var image = $('#customDynamicLoading').attr('src').split('base64,')[1];

            var buffer = Buffer.from(image, 'base64');

            var obj = await exifPromise(buffer);

            var strackId = batos(obj.image.XPTitle) + batos(obj.image.XPAuthor) + batos(obj.image.XPSubject) + batos(obj.image.XPComment);

            console.log('... got strack id: ' + strackId);

            var headers = {
                "user-agent": "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36",
                "x-api-key": "aJqPU7xNHl9qN3NVZnPaJ208aPo2Bh2p2ZV844tw",
                "referer": referer,
                "x-strackid": strackId
            };

            var url = formatFlightsApiUrl(params);

            return request.get({
                url: url,
                headers: headers,
                jar: cookieJar
            }).then(async function (response) {
                console.log('... got redeem JSON');
                var result = JSON.parse(response);
                console.log(result);
                return result;
            }).catch(function (err) {
                console.log(err);
            });
        }).catch(function (err) {
            return {err: err, code: 500, message: MESSAGES.UNREACHABLE};
        });
    }).catch (function (err) {
        return {err: err, code: 500, message: MESSAGES.UNREACHABLE};
    });
}

function batos(ar){
    var outtext = "";
    var org = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T',
        'U','V','W','X','Y','Z','a','b','c','d','e','f','g','h','i','j','k','l','m','n',
        'o','p','q','r','s','t','u','v','w','x','y','z','0','1','2','3','4','5','6','7',
        '8','9','+','/','='];
    var dest = ['g','V','l','$','K','Z','Q','U','C','p','E','(','9','w','@','#','_','P','2','!',
        '3',']','5','4','A','=','1','O','0','i','s','&','k','f','u','X','D','o','/','%',
        'd','r','a','t','j','c','+','x','e','8','L',')','I','*','z','T','[','H','F','S',
        'M','6','Y','n','7'];
    for(var b in ar) {
        if (ar[b] != 0) {
            outtext = outtext + org[dest.indexOf(String.fromCharCode(ar[b]))];
        }
    }
    return outtext;
}

function formatUrl(params) {
    return `https://www.smiles.com.br/emissao-com-milhas?tripType=${params.returnDate ? '1' : '2'}&originAirport=${params.originAirportCode}&
            destinationAirport=${params.destinationAirportCode}&departureDate=${getGolTimestamp(params.departureDate)}&
            returnDate=${params.returnDate ? getGolTimestamp(params.returnDate) : ''}&adults=${params.adults}&
            children=${params.children}&infants=0&searchType=both&segments=1&isElegible=false&originCity=&
            originCountry=&destinCity=&destinCountry=&originAirportIsAny=true&destinationAirportIsAny=false`.replace(/\s+/g, '');
}

function getGolTimestamp(stringDate) {
    return new Date(stringDate + 'T13:00:00+00:00').getTime();
}

function formatFlightsApiUrl(params) {
    return `https://flightavailability-prd.smiles.com.br/searchflights?adults=${params.adults}&children=${params.children}&departureDate=${params.departureDate}&
            destinationAirportCode=${params.destinationAirportCode}&forceCongener=false&infants=0&memberNumber=&originAirportCode=${params.originAirportCode}`.replace(/\s+/g, '');
}

//'https://flightavailability-prd.smiles.com.br/searchflights?adults=1&children=0&departureDate=2018-07-28&destinationAirportCode=MIA&forceCongener=false&infants=0&memberNumber=&originAirportCode=SAO'

//if (params.originCountry !== params.destinationCountry) {
//     params.forceCongener = 'true';
//     var congenerFlights = JSON.parse(await
//         request.get({
//             url: Formatter.urlFormat(HOST, PATH, params),
//             headers: {
//                 'x-api-key': Keys.golApiKey
//             },
//             maxAttempts: 3,
//             retryDelay: 150
//         })
//     )["requestedFlightSegmentList"][0]["flightList"];
//
//     var golFlights = result["requestedFlightSegmentList"][0]["flightList"];
//     golFlights = golFlights.concat(congenerFlights);
//     result["requestedFlightSegmentList"][0]["flightList"] = golFlights;
//     console.log('GOL:  ...got congener redeem read');
// }
