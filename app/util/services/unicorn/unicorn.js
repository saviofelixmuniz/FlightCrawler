var Proxy = require('../proxy');
var UnicornFormatter = require ('../unicorn/unicorn-formatter');

module.exports = getFlightInfo;

async function getFlightInfo(params, company) {
    var request = Proxy.setupAndRotateRequestLib('request-promise', 'unicorn');

    var body = {
        "tripType": params.returnDate ? "RT" : "OW",
        "from": params.originAirportCode,
        "to": params.destinationAirportCode,
        "outboundDate": params.departureDate,
        "adults": Number(params.adults),
        "children": Number(params.children),
        "infants":0,
        "cabin": params.executive ? "EX": "EC"
    };

    if (params.returnDate)
        body["inboundDate"] = params.returnDate;

    var ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36';
    var headers = {
        'user-agent': ua,
        'content-type': 'application/json'
    };

    var searchId = await request.post({
        url: `https://flight-pricing.maxmilhas.com.br/search?time=${(new Date()).getTime()}`,
        headers: headers,
        json: body
    });

    searchId = searchId.id;

    var response = await request.get({
        url: `https://flight-pricing.maxmilhas.com.br/search/${searchId}/flights?airline=${company}`,
        headers: {
            'user-agent': ua
        }
    });

    return UnicornFormatter.responseFormat(JSON.parse(response), params, company);
}
