/**
 * @author Anderson Menezes
 */
module.exports = {
    issueTicket: issueTicket
};

const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
const MESSAGES = require('../util/helpers/messages');
const Proxy = require ('../util/services/proxy');
const Keys = require ('../configs/keys');
const request = require('request-promise');
var tough = require('tough-cookie');
var CookieJar = tough.CookieJar;

async function issueTicket(req, res, next) {
    var pSession = Proxy.createSession('azul', true);
    var data = req.body;

    var requested = await db.getRequest(data.request_id);
    var resources = await db.getRequestResources(data.request_id);
    var reqHeaders = resources.headers;

    if (!requested) {
        Proxy.killSession(pSession);
        res.status(404);
        res.json();
        return;
    }
    /* var emission = await db.createEmissionReport(data.request_id, 'gol', data);
    delete emission.data;
    res.json(emission); */

    var params = requested.params;
    var jar = request.jar();
    jar._jar = CookieJar.deserializeSync(resources.cookieJar);

    var loginUrl = `https://www.smiles.com.br/emissao-com-milhas?p_p_id=smilesloginportlet_WAR_smilesloginportlet&` +
        `p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=loginSmiles&p_p_cacheability=cacheLevelPage&` +
        `_smilesloginportlet_WAR_smilesloginportlet_originAirport=${params.originAirportCode}&` +
        `_smilesloginportlet_WAR_smilesloginportlet_segments=1&` +
        `_smilesloginportlet_WAR_smilesloginportlet_departureDate=${Formatter.getGolTimestamp(params.departureDate)}&` +
        `_smilesloginportlet_WAR_smilesloginportlet_destinationAirport=${params.destinationAirportCode}&` +
        `_smilesloginportlet_WAR_smilesloginportlet_children=${params.children ? params.children : 0}&` +
        `_smilesloginportlet_WAR_smilesloginportlet_tripType=${params.returnDate ? '1' : '2'}&` +
        `_smilesloginportlet_WAR_smilesloginportlet_searchType=g3&_smilesloginportlet_WAR_smilesloginportlet_destinCountry=&` +
        `_smilesloginportlet_WAR_smilesloginportlet_returnDate=${params.returnDate ? Formatter.getGolTimestamp(params.returnDate) : ''}&` +
        `_smilesloginportlet_WAR_smilesloginportlet_originAirportIsAny=true&_smilesloginportlet_WAR_smilesloginportlet_destinCity=&_smilesloginportlet_WAR_smilesloginportlet_originCountry=&_smilesloginportlet_WAR_smilesloginportlet_isElegible=false&_smilesloginportlet_WAR_smilesloginportlet_isFlexibleDateChecked=false&_smilesloginportlet_WAR_smilesloginportlet_adults=${params.adults}&_smilesloginportlet_WAR_smilesloginportlet_originCity=&_smilesloginportlet_WAR_smilesloginportlet_infants=0&_smilesloginportlet_WAR_smilesloginportlet_destinationAirportIsAny=false`;
    var loginRes = await Proxy.require({
        session: pSession,
        request: {
            url: loginUrl,
            form: {
                '_smilesloginportlet_WAR_smilesloginportlet_formDate': new Date().getTime(),
                '_smilesloginportlet_WAR_smilesloginportlet_action': 'login',
                '_smilesloginportlet_WAR_smilesloginportlet_screenName': '73130222634',
                '_smilesloginportlet_WAR_smilesloginportlet_password': '1402'
            },
            jar: jar
        },
    });
    debugger;


}

function findCard(payment, cardList) {
    for (var savedCard of cardList) {
        if (payment.card_name === savedCard.holderName && payment.card_number.substring(0, 6) === savedCard.bin
            && payment.card_number.substring(payment.card_number.length - 4, payment.card_number.length)) {
            return savedCard;
        }
    }

    return null;
}