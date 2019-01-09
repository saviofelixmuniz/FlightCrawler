var Proxy = require('../requester');
var UnicornFormatter = require ('../unicorn/unicorn-formatter');
const MESSAGES = require('../../helpers/messages');
module.exports = getFlightInfo;

async function getFlightInfo(params, company) {
    var session = Requirer.createSession('unicorn');

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

    var headers = {
        'content-type': 'application/json'
    };

    try {
        var searchId = await Requirer.require({
            session: session,
            request: {
                url: `https://flight-pricing.maxmilhas.com.br/search?time=${(new Date()).getTime()}`,
                headers: headers,
                json: body
            }
        });

        searchId = searchId.id;

        var response = await Requirer.require({
            session: session,
            request: {
                url: `https://flight-pricing.maxmilhas.com.br/search/${searchId}/flights?airline=${company}`
            }
        });
    } catch (err) {
        Requirer.killSession(session);
        return {err: err.stack, code: 500, message: MESSAGES.UNREACHABLE};
    }

    Requirer.killSession(session);
    try {
        return UnicornFormatter.responseFormat(JSON.parse(response), params, company);
    } catch (err) {
        return {err: err.stack, code: 500, message: MESSAGES.PARSE_ERROR};
    }
}
