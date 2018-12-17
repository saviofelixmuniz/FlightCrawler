/**
 * @author Anderson Menezes
 */
module.exports = {
    issueTicket: issueTicket,
    getAccountBalance: getAccountBalance,
    getBalanceStatus: getBalanceStatus
};

const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
const Proxy = require ('../util/services/proxy');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

function formatUrl(params) {
    return 'https://www.latam.com/pt_br/apps/multiplus/booking?application=lanpass' +
        `&from_city1=${params.originAirportCode}&to_city1=${params.destinationAirportCode}` +
        (!params.returnDate ? '' : (`&from_city2=${params.destinationAirportCode}&to_city2=${params.originAirportCode}` +
        `&fecha2_dia=${params.returnDate.split('-')[2]}&fecha2_anomes=${params.returnDate.split('-')[0] + '-' + params.returnDate.split('-')[1]}`)) +
        `&fecha1_dia=${params.departureDate.split('-')[2]}&fecha1_anomes=${params.departureDate.split('-')[0] + '-' + params.departureDate.split('-')[1]}` +
        `&ida_vuelta=${params.returnDate ? 'ida_vuelta' : 'ida'}&nadults=${params.adults}&nchildren=${params.children}&ninfants=0&cabina=Y`;
}

async function issueTicket(req, res, next) {
    var pSession = Proxy.createSession('latam');
    var data = req.body;

    var requested = await db.getRequest(data.request_id);
    var resources = await db.getRequestResources(data.request_id);
    var params = requested.params;

    if (!requested) {
        Proxy.killSession(pSession);
        res.status(404);
        res.json();
        return;
    }

    var searchUrl = formatUrl(params);

    const browser = await puppeteer.launch({
        headless: false
    });
    const page = await browser.newPage();

    // Search page
    const LOGIN_BUTTON = '#hyfMultiplus > nav > section > div.header-user-info.hyf-hidden-xs.hyf-visible-sm.hyf-visible-md.hyf-visible-lg > div > div.data-logout > div > a';
    await page.goto(searchUrl);
    await page.waitFor(LOGIN_BUTTON);
    await page.evaluate('MultiplusHeader.login()');
    await page.waitFor('#login');

    // Login page
    await page.click('#login');
    await page.keyboard.type(data.credentials.login);

    await page.click('#password');
    await page.keyboard.type(data.credentials.password);

    await page.click('#btnEnter');

    // Search page
    if (data.going_flight_id)
        var goingFlight = getFlightById(requested.response.Trechos[params.originAirportCode+params.destinationAirportCode].Voos, data.going_flight_id);

    if (data.returning_flight_id)
        var returningFlight = getFlightById(requested.response.Trechos[params.destinationAirportCode+params.originAirportCode].Voos, data.returning_flight_id);

    await page.waitFor('#' + getCompleteFlightId(goingFlight));
    await page.click('#' + getCompleteFlightId(goingFlight));

    const CONTINUE_BUTTON = '#appMain > div > div > div:nth-child(3) > div > div > section.container.flight-list > ul > ' +
        `li.flight.selected.cabin-${params.executive === 'true' ? 'J.fare-MPLUS_PREMIUM_BUSINESS_CLASSICO ' : 'Y.fare-MPLUS_CLASSICO '}` +
        '> div.collapsable-information.one-cabin > div > div.collapsable-information-navigation.has-fare-selector > button';

    if (returningFlight) {
        await page.click(CONTINUE_BUTTON);
        await page.waitFor('#' + getCompleteFlightId(returningFlight));
        await page.click('#' + getCompleteFlightId(returningFlight));
        await page.waitFor('#submit-flights');
    }

    await page.click('#submit-flights');

    // Itinerary page
    await page.waitFor('#check_condiciones');
    await page.click('#check_condiciones');
    await page.click('#submitButton');

    // Passengers page
    await page.waitFor('#cambiarDatos');
    await page.click('#cambiarDatos');


    debugger;

}

function getFlightById(flights, id) {
    for (let flight of flights) {
        if (flight._id.toString() === id) return flight;
    }

    return null;
}

function getCompleteFlightId(flight) {
    var id = flight['NumeroVoo'];
    for (let i=1; i < flight['Conexoes'].length; i++) {
        id += flight['Conexoes'][i]['NumeroVoo'];
    }

    return id;
}


var balanceStatus = "FREE";
var errors = [];
var successes = [];
var map = {};
var totalAccounts = 0;

async function getBalanceStatus(req, res, next) {
    res.status(200);
    return res.json({
        status: balanceStatus,
        errors: errors,
        successes: successes,
        totalAccounts: totalAccounts
    })
}

async function getAccountBalance(req, res, next) {
    if (balanceStatus === 'PROCESSING') {
        res.status(423);
        res.json();
        return;
    }

    res.status(200);
    res.json();

    balanceStatus = 'PROCESSING';
    errors = [];
    successes = [];
    map = {};
    var accounts = req.body;
    totalAccounts = accounts.length;

    var pSession = Proxy.createSession('latam');

    var i = 0;
    var tries = 0;
    while (i < accounts.length) {
        try {
            tries++;
            pSession = Proxy.createSession('latam');

            var row = accounts[i];
            var login = row['CPF'] || row['cpf'];
            var password = row['senha'];

            if (!login || !password) {
                console.log('erro: ' + row);
                continue;
            }

            var searchUrl = formatUrl({adults: '1', children: '0', departureDate: '2019-12-01', originAirportCode: 'SAO', destinationAirportCode: 'RIO'});
            var searchRes = await Proxy.require({
                session: pSession,
                request: {
                    url: searchUrl
                }
            });

            var loginPageUrl = 'https://www.latam.com/cgi-bin/site_login.cgi?page=' + searchUrl;
            var loginPageRes = await Proxy.require({
                session: pSession,
                request: {
                    url: loginPageUrl
                }
            });

            var extraParam = getExtraParam(loginPageRes);
            var loginUrl = 'https://www.latam.com/cgi-bin/login/login_latam.cgi';
            var loginRes = await Proxy.require({
                session: pSession,
                request: {
                    url: loginUrl,
                    form: {
                        'cm_target_action': searchUrl,
                        'login': login,
                        'password': password,
                        'extraParam': extraParam
                    },
                    resolveWithFullResponse: true
                }
            });

            var header = null;
            for (let h of loginRes.headers['set-cookie']) {
                if (h.indexOf('latam_user_data') !== -1) {
                    header = h;
                }
            }

            var info = decodeURIComponent(header).split(';');
            for (let j of info) {
                if (Number(j)) {
                    map[login] = Number(j);
                    successes.push({CPF: login, saldo: map[login]});
                }
            }

            Proxy.killSession(pSession);

            if (map[login] === undefined || map[login] === null) {
                if (tries < 3) {
                    console.log('tentando novamente: ' + login);
                } else {
                    i++;
                    tries = 0;
                    errors.push(login);
                    console.log('erro: ' + login);
                }
                continue;
            }
            console.log(login + ',' + map[login]);
            i++;
            tries = 0;
        } catch (e) {
            if (tries < 3) {
                console.log('tentando novamente: ' + login);
            } else {
                i++;
                tries = 0;
                errors.push(login);
                console.log('erro: ' + login);
            }
        }
    }
    balanceStatus = 'DONE';
}
