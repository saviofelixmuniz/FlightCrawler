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
const Requester = require ('../util/services/requester');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

var sessions = {};

function formatUrl(params) {
    return 'https://www.latam.com/pt_br/apps/multiplus/booking?application=lanpass' +
        `&from_city1=${params.originAirportCode}&to_city1=${params.destinationAirportCode}` +
        (!params.returnDate ? '' : (`&from_city2=${params.destinationAirportCode}&to_city2=${params.originAirportCode}` +
        `&fecha2_dia=${params.returnDate.split('-')[2]}&fecha2_anomes=${params.returnDate.split('-')[0] + '-' + params.returnDate.split('-')[1]}`)) +
        `&fecha1_dia=${params.departureDate.split('-')[2]}&fecha1_anomes=${params.departureDate.split('-')[0] + '-' + params.departureDate.split('-')[1]}` +
        `&ida_vuelta=${params.returnDate ? 'ida_vuelta' : 'ida'}&nadults=${params.adults}&nchildren=${params.children}&ninfants=0&cabina=Y`;
}

async function issueTicket(req, res, next) {
    var data = req.body;

    var requested = await db.getRequest(data.request_id);
    var resources = await db.getRequestResources(data.request_id);
    var params = requested.params;

    if (!requested) {
        res.status(404);
        res.json();
        return;
    }
    /*var emission = await db.createEmissionReport(data.request_id, 'latam', data);
    delete emission.data;
    res.json(emission);*/

    var searchUrl = formatUrl(params);

    const browser = await puppeteer.launch({
        headless: false
    });
    const page = await browser.newPage();
    //sessions[emission._id.toString()] = { browser: browser, page: page };

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

    // TODO: Verify prices

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

    // TODO:
    // SMS Confirmation page if number of passengers is > 1

    // Passengers page
    await page.waitFor('#cambiarDatos');
    await page.waitFor(3000);
    await page.click('#cambiarDatos');

    let i = 0;
    for (let passenger of data.passengers) {
        i++;
        await page.click(`#pax_ADT_${i}_titulo`);
        // await page.click(`#pax_ADT_${i}_titulo > option:nth-child(${passenger.gender.toUpperCase() === 'M' ? '1' : '2'})`);
        await page.select(`#pax_ADT_${i}_titulo`, (passenger.gender.toUpperCase() === 'M' ? '0' : '1'));

        if (i === 1) await selectTextAndDelete(page, `#pax_ADT_${i}_nombre`);
        await page.keyboard.type(passenger.name.first);

        if (i === 1) await selectTextAndDelete(page, `#pax_ADT_${i}_primer_apellido`);
        await page.keyboard.type(passenger.name.last);

        if (i === 1) {
            await selectTextAndDelete(page, `#pax_ADT_${i}_ff_number`);
            await page.select('#pax_ADT_1_ff_airline', '');
        }

        await page.click(`#pax_ADT_${i}_foid_tipo`);
        // await page.click(`#pax_ADT_${i}_foid_tipo > option:nth-child(${passenger.document.type === 'passport' ? '1' : '2'})`);
        await page.select(`#pax_ADT_${i}_foid_tipo`, (passenger.document.type === 'passport' ? 'PP' : 'NI'));
        await page.click(`#pax_ADT_${i}_foid_numero`);
        await page.keyboard.type(passenger.document.number);
    }

    // Contact
    await selectTextAndDelete(page, '#email');
    await page.keyboard.type(data.credentials.email);

    await selectTextAndDelete(page, '#id_telefono_celular_l1 > input');
    await page.keyboard.type('55');

    await selectTextAndDelete(page, '#id_telefono_celular_l3 > input.input.telefonos.telefono-celular.telefono-codigo-area');
    await page.keyboard.type(data.credentials.token.area_code);

    await selectTextAndDelete(page, '#id_telefono_celular_l5 > input');
    await page.keyboard.type(data.credentials.token.number);

    debugger;
    await page.click('#submitButton');

    // TODO:
    // SMS Confirmation page

    // Payment page
    await page.waitFor('#CREDIT_CARD_REGION');
    await page.click(getCardSelector(data.payment.card_brand_code));
    await page.click('#creditCardField-c359');
    await page.keyboard.type(data.payment.card_number);
    await page.click('#expirationDateField-c375');
    await page.keyboard.type(data.payment.card_exp_date);
    await page.click('#verificationNumberField-c379');
    await page.keyboard.type(data.payment.card_security_code);
    await page.click('#cashierField-c363');
    await page.keyboard.type(data.payment.card_name);

    await page.click('#cashierField-c367');
    await page.keyboard.type(data.payment.card_name.split(' ')[0]);
    await page.click('#cashierField-c371');
    await page.keyboard.type(data.payment.card_name.substring((data.payment.card_name.indexOf(' ') + 1)));
    await page.click('#cashierField-c429');
    await page.keyboard.type(data.payment.birthday.split('/')[0]);
    await page.select('#selectField-c433', data.payment.birthday.split('/')[1]);
    await page.click('#cashierField-c437');
    await page.keyboard.type(data.payment.birthday.split('/')[2]);
    await page.click('#cashierField-c425');
    await page.keyboard.type(data.payment.cpf);
    await page.click('#cashierField-c445');
    await page.keyboard.type(data.payment.email);
    await page.click('#cepField-c403');
    await page.keyboard.type(data.payment.cep);
    await page.click('#cashierField-c411');
    await page.keyboard.type(data.payment.number);
    await page.click('#cashierField-c415');
    await page.keyboard.type(data.payment.complement);
    await page.waitFor(2000);

    /*await browser.close();
    console.log('closed');*/

}

function getCardSelector(brand) {
    var index = 0;

    switch (brand.toUpperCase()) {
        case 'MC':
            index = 4;
            break;
        case 'VI':
            index = 1;
            break;
        case 'DI':
            index = 3;
            break;
        case 'AX':
            index = 2;
            break;
        case 'EL':
            index = 6;
            break;
        case 'HP':
            index = 5;
            break;
    }

    return `#CREDIT_CARD_REGION > div:nth-child(2) > div > form > div.col-xs-12.col-md-8.col-lg-8.col-md-pull-4.col-lg-pull-4 > div.box-white > div:nth-child(1) > div > div > div > div > div.col-xs-10.col-sm-10.col-lg-10.images-content > div:nth-child(${index}) > div > label > input`
}

async function selectTextAndDelete(page, input) {
    await page.click(input, { clickCount: 3 });
    await page.keyboard.press('Backspace');
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

    var pSession = Requester.createSession('latam');

    var i = 0;
    var tries = 0;
    while (i < accounts.length) {
        try {
            tries++;
            pSession = Requester.createSession('latam');

            var row = accounts[i];
            var login = row['CPF'] || row['cpf'];
            var password = row['senha'];

            if (!login || !password) {
                console.log('erro: ' + row);
                continue;
            }

            var searchUrl = formatUrl({adults: '1', children: '0', departureDate: '2019-12-01', originAirportCode: 'SAO', destinationAirportCode: 'RIO'});
            var searchRes = await Requester.require({
                session: pSession,
                request: {
                    url: searchUrl
                }
            });

            var loginPageUrl = 'https://www.latam.com/cgi-bin/site_login.cgi?page=' + searchUrl;
            var loginPageRes = await Requester.require({
                session: pSession,
                request: {
                    url: loginPageUrl
                }
            });

            var extraParam = getExtraParam(loginPageRes);
            var loginUrl = 'https://www.latam.com/cgi-bin/login/login_latam.cgi';
            var loginRes = await Requester.require({
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

            Requester.killSession(pSession);

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
