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
<<<<<<< HEAD
const adyenEncrypt = require('node-adyen-encrypt');
const Time = require('../util/helpers/time-utils');

async function issueTicket(req, res, next) {
    var pSession = Proxy.createSession('gol', true);
    var taxSession = Proxy.createSession('gol', true);
=======
const request = require('request-promise');
var tough = require('tough-cookie');
var CookieJar = tough.CookieJar;

async function issueTicket(req, res, next) {
    var pSession = Proxy.createSession('azul', true);
>>>>>>> 99b393427a65b6f02ab1395b650b534c6c92ec77
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

    var emission = await db.createEmissionReport(data.request_id, 'gol', data);
    delete emission.data;
    res.json(emission);

    var params = requested.params;
<<<<<<< HEAD

    try {
        if (data.going_flight_id) var goingFlight = Formatter.getFlightById(data.going_flight_id, requested.response.Trechos);
        if (data.returning_flight_id) var returningFlight = Formatter.getFlightById(data.returning_flight_id, requested.response.Trechos);

        var taxUrl = `https://flightavailability-prd.smiles.com.br/getboardingtax?type=SEGMENT_1&uid=${data.going_flight_id ? goingFlight.id : returningFlight.id}` +
            `&fareuid=${data.going_flight_id ? goingFlight.Milhas[0].id : returningFlight.Milhas[0].id}` +
            `&adults=${Formatter.countPassengers(data.passengers, 'ADT')}&children=${Formatter.countPassengers(data.passengers, 'CHD')}&infants=0`;
        if (data.going_flight_id && data.returning_flight_id)
            taxUrl += `&type2=SEGMENT_2&fareuid2=${returningFlight.Milhas[0].id}&uid2=${returningFlight.id}`;

        const request = require('request-promise');
        var tough = require('tough-cookie');
        var CookieJar = tough.CookieJar;
        var jar = request.jar();
        jar._jar = CookieJar.deserializeSync(resources.cookieJar);
        var taxRes = await Proxy.require({
            session: taxSession,
            request: {
                method: 'GET',
                url: taxUrl,
                headers: reqHeaders,
                json: true,
                jar: jar
            }
        });
        Proxy.killSession(taxSession);
        if (!taxRes || taxRes.errorMessage || !taxRes.flightList) {
            Proxy.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 1, 'Couldn\'t get taxes', true);
            return;
        }
        await db.updateEmissionReport('gol', emission._id, 1, null);

        //reqHeaders['User-Agent'] = 'Smiles/2.53.0/21530 (unknown Android SDK built for x86; Android 7.1.1) OkHttp';
        //reqHeaders['http.useragent'] = 'Smiles/2.53.0/21530 (unknown Android SDK built for x86; Android 7.1.1) OkHttp';
        //reqHeaders['x-api-key'] = Keys.smilesApiKey;
        //reqHeaders['Channel'] = 'APP';
        delete reqHeaders['x-strackid'];
        delete reqHeaders['referer'];

        var tokenRes = await Proxy.require({
            session: pSession,
            request: {
                url: 'https://api.smiles.com.br/api/oauth/token',
                form: {
                    grant_type: 'client_credentials',
                    client_id: '827160d9-0261-415f-993d-e47fd03f8ea5',
                    client_secret: 'fabedc42-c0fd-4d44-aef8-3e7dc2719b08'
                },
                json: true,
                jar: jar
            },
        });
        if (!tokenRes || !tokenRes.access_token) {
            Proxy.killSession(pSession);
            db.updateEmissionReport('gol', 'gol', emission._id, 2, 'Couldn\'t login', true);
            return;
        }
        reqHeaders.Authorization = 'Bearer ' + tokenRes.access_token;
        await db.updateEmissionReport('gol', emission._id, 2, null);

        var loginRes = await Proxy.require({
            session: pSession,
            request: {
                headers: reqHeaders,
                url: 'https://api.smiles.com.br/smiles/login',
                json: {
                    id: data.credentials.login,
                    password: data.credentials.password
                },
                jar: jar
            }
        });
        if (!loginRes || !loginRes.token) {
            Proxy.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 3, 'Couldn\'t login', true);
            return;
        }
        reqHeaders.Authorization = 'Bearer ' + loginRes.token;
        await db.updateEmissionReport('gol', emission._id, 3, null);

        var memberRes = await Proxy.require({
            session: pSession,
            request: {
                headers: reqHeaders,
                url: 'https://api.smiles.com.br/smiles-bus/MemberRESTV1/GetMember',
                json: {
                    memberNumber: loginRes.memberNumber,
                    token: loginRes.token
                },
                jar: jar
            }
        });
        if (!memberRes || !memberRes.member) {
            Proxy.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 4, 'Couldn\'t get member', true);
            return;
        }
        await db.updateEmissionReport('gol', emission._id, 4, null);

        var booking = Formatter.formatSmilesCheckoutForm(data, taxRes.flightList, loginRes.memberNumber, null, params);
        debugger;
        var checkoutRes = await Proxy.require({
            session: pSession,
            request: {
                headers: reqHeaders,
                url: 'https://api.smiles.com.br/api/checkout',
                json: booking,
                jar: jar
            }
        });
        debugger;
        if (!checkoutRes || !checkoutRes.itemList) {
            Proxy.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 5, 'Couldn\'t checkout', true);
            return;
        }
        await db.updateEmissionReport('gol', emission._id, 5, null);

        var passengersForm = Formatter.formatSmilesPassengersForm(data.passengers, checkoutRes.itemList[0].fee ? checkoutRes.itemList[1].id : checkoutRes.itemList[0].id);
        var passengersRes = await Proxy.require({
            session: pSession,
            request: {
                headers: reqHeaders,
                url: 'https://api.smiles.com.br/api/checkout/passengers',
                json: passengersForm
            }
        });
        if (!passengersRes) {
            Proxy.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 6, 'Couldn\'t set passengers', true);
            return;
        }
        await db.updateEmissionReport('gol', emission._id, 6, null);

        var getCheckoutRes = await Proxy.require({
            session: pSession,
            request: {
                headers: reqHeaders,
                url: 'https://api.smiles.com.br/api/checkout',
                json: true,
                method: 'GET'
            }
        });
        if (!getCheckoutRes || !getCheckoutRes.savedCardList) {
            Proxy.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 7, 'Couldn\'t get checkout info', true);
            return;
        }
        await db.updateEmissionReport('gol', emission._id, 7, null);

        var savedCard = findCard(data.payment, getCheckoutRes.savedCardList);

        var reservationRes = await Proxy.require({
            session: pSession,
            request: {
                headers: reqHeaders,
                url: 'https://api.smiles.com.br/api/credits/reservation'
            }
        });

        var encryptedCard = null;
        var cardTokenRes = null;
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
            cardTokenRes = await Proxy.require({
                session: pSession,
                request: {
                    headers: reqHeaders,
                    url: cardTokenUrl,
                    json: true,
                    method: 'GET'
                }
            });

            if (!cardTokenRes || !cardTokenRes.bin) {
                Proxy.killSession(pSession);
                db.updateEmissionReport('gol', emission._id, 8, 'Couldn\'t get credit card token', true);
                return;
            }
            await db.updateEmissionReport('gol', emission._id, 8, null);
        }

        var orderForm = Formatter.formatSmilesOrderForm(checkoutRes.itemList, cardTokenRes, encryptedCard, loginRes.memberNumber, data, savedCard);
        var orderRes = await Proxy.require({
            session: pSession,
            request: {
                headers: reqHeaders,
                url: 'https://api.smiles.com.br/api/orders',
                json: orderForm
            }
        });
        if (!orderRes || !orderRes.orderId) {
            Proxy.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 9, 'Couldn\'t place order and pay', true);
            return;
        }
        await db.updateEmissionReport('gol', emission._id, 9, null, false, {orderId: orderRes.orderId});


        var today = new Date();
        var lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 10);
=======
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

>>>>>>> 99b393427a65b6f02ab1395b650b534c6c92ec77

        var tries = 0;
        while (true) {
            var getOrderRes = await Proxy.require({
                session: pSession,
                request: {
                    headers: reqHeaders,
                    url: `https://api.smiles.com.br/api/orders?orderId=${orderRes.orderId}&beginDate=${Time.formatDateReverse(today)}&endDate=${lastWeek}`,
                    json: true,
                    method: 'GET'
                }
            });
            debugger;
            if (!getOrderRes || !getOrderRes.orderList || (getOrderRes.orderList[0].status !== 'PROCESSED' &&
                getOrderRes.orderList[0].status !== 'IN_PROGRESS') || tries > 4) {
                Proxy.killSession(pSession);
                db.updateEmissionReport('gol', emission._id, 10, 'Couldn\'t get locator', true);
                return;
            }
            if (getOrderRes.orderList[0].status === 'PROCESSED') {
                var recordLocator = getOrderRes.orderList[0].itemList[0].booking ? getOrderRes.orderList[0].itemList[0].booking.flight.chosenFlightSegmentList[0].recordLocator :
                    getOrderRes.orderList[0].itemList[1].booking.flight.chosenFlightSegmentList[0].recordLocator;
                db.updateEmissionReport('gol', emission._id, 10, null, true, {locator: recordLocator, orderId: orderRes.orderId});
                return;
            }
            tries++;
            await sleep(2500);
        }
    } catch (err) {
        Proxy.killSession(pSession);
        db.updateEmissionReport('gol', emission._id, null, err.stack, true);
    }
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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}