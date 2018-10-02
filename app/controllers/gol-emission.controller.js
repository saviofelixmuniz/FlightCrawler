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
const adyenEncrypt = require('node-adyen-encrypt');

async function issueTicket(req, res, next) {
    var exec = require('child_process').exec;
    var pSession = Proxy.createSession('azul');
    var data = req.body;

    var requested = await db.getRequest(data.request_id);
    var resources = await db.getRequestResources(data.request_id);
    var reqHeaders = resources.headers;
    reqHeaders['User-Agent'] = 'Smiles/2.53.0/21530 (unknown Android SDK built for x86; Android 7.1.1) OkHttp';
    reqHeaders['http.useragent'] = 'Smiles/2.53.0/21530 (unknown Android SDK built for x86; Android 7.1.1) OkHttp';
    reqHeaders['x-api-key'] = 'p6QLrMhjOu3erSfHtFbRK8C1zC1VxIV85OTfEBJK';
    reqHeaders['Channel'] = 'APP';
    reqHeaders['API_VERSION'] = '2';
    delete reqHeaders['x-strackid'];
    delete reqHeaders['referer'];
    delete reqHeaders['user-agent'];

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

    var tokenRes = await Proxy.require({
        session: pSession,
        request: {
            url: 'https://api.smiles.com.br/api/oauth/token',
            form: {
                grant_type: 'client_credentials',
                client_id: '827160d9-0261-415f-993d-e47fd03f8ea5',
                client_secret: 'fabedc42-c0fd-4d44-aef8-3e7dc2719b08'
            },
            json: true
        },
    });
    reqHeaders.Authorization = 'Bearer ' + tokenRes.access_token;

    var loginRes = await Proxy.require({
        session: pSession,
        request: {
            headers: reqHeaders,
            url: 'https://api.smiles.com.br/smiles/login',
            json: {
                id: data.credentials.login,
                password: data.credentials.password
            }
        }
    });
    reqHeaders.Authorization = 'Bearer ' + loginRes.token;

    var memberRes = await Proxy.require({
        session: pSession,
        request: {
            headers: reqHeaders,
            url: 'https://api.smiles.com.br/smiles-bus/MemberRESTV1/GetMember',
            json: {
                memberNumber: loginRes.memberNumber,
                token: loginRes.token
            }
        }
    });

    if (data.going_flight_id) var goingFlight = Formatter.getFlightById(data.going_flight_id, requested.response.Trechos);
    if (data.returning_flight_id) var returningFlight = Formatter.getFlightById(data.returning_flight_id, requested.response.Trechos);

    var taxUrl = `https://flightavailability-prd.smiles.com.br/getboardingtax?adults=${Formatter.countPassengers(data.passengers, 'ADT')}&children=${Formatter.countPassengers(data.passengers, 'CHD')}` +
        `&fareuid=${data.going_flight_id ? goingFlight.Milhas[0].id : returningFlight.Milhas[0].id}&infants=0&type=SEGMENT_1&uid=${data.going_flight_id ? goingFlight.id : returningFlight.id}`;
    if (data.going_flight_id && data.returning_flight_id)
        taxUrl += `&type2=SEGMENT_2&fareuid2=${returningFlight.Milhas[0].id}&uid2=${returningFlight.id}`;

    let taxRes = await Proxy.require({
        session: pSession,
        request: {
            method: 'GET',
            url: taxUrl,
            headers: reqHeaders,
            json: true
        }
    });
    if(taxRes.errorMessage) {
        res.status(500);
        res.json();
        return;
    }

    var booking = Formatter.formatSmilesCheckoutForm(data, taxRes.flightList, loginRes.memberNumber, null);
    var checkoutRes = await Proxy.require({
        session: pSession,
        request: {
            headers: reqHeaders,
            url: 'https://api.smiles.com.br/api/checkout',
            json: booking
        }
    });
    if (!checkoutRes.itemList) {
        res.status(500);
        res.json();
        return;
    }

    var passengersForm = Formatter.formatSmilesPassengersForm(data.passengers, checkoutRes.itemList[0].fee ? checkoutRes.itemList[1].id : checkoutRes.itemList[0].id);
    var passengersRes = await Proxy.require({
        session: pSession,
        request: {
            headers: reqHeaders,
            url: 'https://api.smiles.com.br/api/checkout/passengers',
            json: passengersForm
        }
    });

    var getCheckoutRes = await Proxy.require({
        session: pSession,
        request: {
            headers: reqHeaders,
            url: 'https://api.smiles.com.br/api/checkout',
            json: true,
            method: 'GET'
        }
    });

    var savedCard = findCard(data.payment, getCheckoutRes.savedCardList);
    debugger;

    var reservationRes = await Proxy.require({
        session: pSession,
        request: {
            headers: reqHeaders,
            url: 'https://api.smiles.com.br/api/credits/reservation'
        }
    });

    var encryptedCard = undefined;
    if (!savedCard) {
        var cardData = {
            number: data.payment.card_number,
            cvc: data.payment.card_security_code,
            holderName: data.payment.card_name,
            expiryMonth: data.payment.card_exp_date.split('/')[0],
            expiryYear: data.payment.card_exp_date.split('/')[1],
            generationtime: new Date().toISOString()
        };

        var cseInstance = adyenEncrypt.createEncryption(Keys.smilesEncryptionKey, {numberIgnoreNonNumeric: true});
        encryptedCard = cseInstance.encrypt(cardData);

        var shopperName = encodeURIComponent(memberRes.member.firstName + ' ' + memberRes.member.lastName);
        var number = encodeURIComponent(Buffer.from(data.payment.card_number).toString('base64')) + '%0A';
        var holder = encodeURIComponent(data.payment.card_name);
        var expirationDate = data.payment.card_exp_date;
        var brand = Formatter.getSmilesCardBrandByCode(data.payment.card_brand_code);
        var bin = data.payment.card_number.substring(0, 5);
        var cardTokenUrl = `https://api.smiles.com.br/api/card/token?shopperName=${shopperName}` +
            `&number=${number}&holder=${holder}` +
            `&expirationDate=${expirationDate}&brand=${brand}` +
            `&bin=${bin}&isOneClick=false`;
        var cardTokenRes = await Proxy.require({
            session: pSession,
            request: {
                headers: reqHeaders,
                url: cardTokenUrl,
                json: true,
                method: 'GET'
            }
        });
    }

    /*var expMonth = data.payment.card_exp_date.split('/')[0];
    expMonth = expMonth[0] === '0' ? expMonth[1] : expMonth;
    var args = `${data.payment.card_number} ${data.payment.card_security_code} "${data.payment.card_name}" ` +
        `${expMonth} ${data.payment.card_exp_date.split('/')[1]}`;
    var encryptedCard = await new Promise((resolve) => {
        return exec(`java -jar C:/Users/Anderson/Anderson/CardEncryption/out/artifacts/CardEncryption_jar/CardEncryption.jar ` + args,
            function (error, stdout, stderr) {
                console.log('stdout: ' + stdout);
                if (error || stderr) {
                    console.log('exec error: ' + error);
                    console.log('stderr: ' + stderr);
                    return resolve(null);
                }
                return resolve(stdout);
            });
    });*/

    debugger;
    var orderForm = Formatter.formatSmilesOrderForm(checkoutRes.itemList, cardTokenRes, encryptedCard, loginRes.memberNumber, data, savedCard);
    var orderRes = await Proxy.require({
        session: pSession,
        request: {
            headers: reqHeaders,
            url: 'https://api.smiles.com.br/api/orders',
            json: orderForm
        }
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