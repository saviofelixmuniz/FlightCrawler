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
    var pSession = Proxy.createSession('gol', true);
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

    if (data.going_flight_id) var goingFlight = Formatter.getFlightById(data.going_flight_id, requested.response.Trechos);
    if (data.returning_flight_id) var returningFlight = Formatter.getFlightById(data.returning_flight_id, requested.response.Trechos);

    var taxUrl = `https://flightavailability-prd.smiles.com.br/getboardingtax?adults=${Formatter.countPassengers(data.passengers, 'ADT')}&children=${Formatter.countPassengers(data.passengers, 'CHD')}` +
        `&fareuid=${data.going_flight_id ? goingFlight.Milhas[0].id : returningFlight.Milhas[0].id}&infants=0&type=SEGMENT_1&uid=${data.going_flight_id ? goingFlight.id : returningFlight.id}`;
    if (data.going_flight_id && data.returning_flight_id)
        taxUrl += `&type2=SEGMENT_2&fareuid2=${returningFlight.Milhas[0].id}&uid2=${returningFlight.id}`;

    var taxRes = await Proxy.require({
        session: pSession,
        request: {
            method: 'GET',
            url: taxUrl,
            headers: reqHeaders,
            jar: jar,
            json: true
        },
    });

    var cognitoIdRes = await Proxy.require({
        session: pSession,
        request: {
            url: 'https://cognito-identity.us-east-1.amazonaws.com',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityService.GetCredentialsForIdentity'
            },
            json: {"IdentityId":"us-east-1:5df4df7d-b9a0-4f6b-857c-748e957c502b"}
        },
    });

    var loginUrl = `https://www.smiles.com.br/login?p_p_id=smilesloginstepportlet_WAR_smilesloginportlet&p_p_lifecycle=2&p_p_resource_id=stepLogin`;
    var loginRes = await Proxy.require({
        session: pSession,
        request: {
            url: loginUrl,
            headers: reqHeaders,
            form: {
                urlCallback: '/group/guest/dados-emissao?p_p_id=58&p_p_lifecycle=0',
                product: '',
                screenName: data.credentials.login,
                password: data.credentials.password
            },
            jar: jar,
            json: true
        },
    });

    var postLoginRes = await Proxy.require({
        session: pSession,
        request: {
            url: 'https://www.smiles.com.br/group/guest/dados-emissao',
            headers: reqHeaders,
            jar: jar
        },
    });

    var postLoginRes2 = await Proxy.require({
        session: pSession,
        request: {
            url: 'https://www.smiles.com.br/group/guest/dados-emissao?p_p_id=smilesloginportlet_WAR_smilesloginportlet&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=renderLogin&p_p_cacheability=cacheLevelPage',
            jar: jar
        },
    });

    var postLoginRes3 = await Proxy.require({
        session: pSession,
        request: {
            url: 'https://www.smiles.com.br/group/guest/dados-emissao?p_p_id=bookingpassengerportlet_WAR_smilesbookingportlet&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=loadPassengerData&p_p_cacheability=cacheLevelPage&p_p_col_id=_118_INSTANCE_OgoK8vmciTFu__column-2&p_p_col_count=1',
            headers: {
                'referer':'https://www.smiles.com.br/group/guest/dados-emissao',
                'user-agent':'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
                'Content-Type':'application/x-www-form-urlencoded'
            },
            form: {
                '_bookingpassengerportlet_WAR_smilesbookingportlet_loggedSearch': 'true'
            },
            jar: jar
        },
    });

    debugger;

    var passengersRes = await Proxy.require({
        session: pSession,
        request: {
            url: 'https://www.smiles.com.br/group/guest/dados-emissao?p_p_id=bookingpassengerportlet_WAR_smilesbookingportlet&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=addPassengersCheckout&p_p_cacheability=cacheLevelPage&p_p_col_id=_118_INSTANCE_OgoK8vmciTFu__column-2&p_p_col_count=1',
            headers: reqHeaders,
            form: {
                _bookingpassengerportlet_WAR_smilesbookingportlet_flightSearchJson: '{"passengerList":[{"type":"ADT","index":"0","passaportRequired":"false","showPassport":"false","firstName":"Anderson","lastName":"Menezes","gender":"MALE","birthdayDay":"07","birthdayMonth":"02","birthdayYear":"1995","cpfOrNumber":"","email":"asales_cg@hotmail.com","requestSpecialServiceSegments":["1","2"],"birthday":"1995-02-07T00:00:00.000Z","passaport":{}}]}',
                _bookingpassengerportlet_WAR_smilesbookingportlet_itemIdPassenger: '26986384',
                _bookingpassengerportlet_WAR_smilesbookingportlet_cartIdPassenger: '18035393'
            },
            jar: jar,
            json: true
        },
    });

    debugger;
}