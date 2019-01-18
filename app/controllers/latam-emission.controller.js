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

var sessions = [];

function formatUrl(params, data) {
    return 'https://www.latam.com/pt_br/apps/multiplus/booking?application=lanpass' +
        `&from_city1=${params.originAirportCode}&to_city1=${params.destinationAirportCode}` +
        (!params.returnDate ? '' : (`&from_city2=${params.destinationAirportCode}&to_city2=${params.originAirportCode}` +
        `&fecha2_dia=${params.returnDate.split('-')[2]}&fecha2_anomes=${params.returnDate.split('-')[0] + '-' + params.returnDate.split('-')[1]}`)) +
        `&fecha1_dia=${params.departureDate.split('-')[2]}&fecha1_anomes=${params.departureDate.split('-')[0] + '-' + params.departureDate.split('-')[1]}` +
        `&ida_vuelta=${params.returnDate ? 'ida_vuelta' : 'ida'}&nadults=${Formatter.countPassengers(data.passengers, 'ADT')}` +
        `&nchildren=${Formatter.countPassengers(data.passengers, 'ADT')}&ninfants=0` +
        `&cabina=${params.executive && params.executive === 'true' ? 'J' : 'Y'}`;
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

    var searchUrl = formatUrl(params, data);

    const session = Requester.createSession('latam', true);
    const proxyStr = await Requester.getProxyString(session);
    var proxyUrl = 'http://' + proxyStr.split('@')[1];
    var proxyCredentials = proxyStr.split('@')[0].substring(7).split(':');

    const browserOptions = {
        headless: false,
        args: [
            '--no-sandbox', '--disable-setuid-sandbox'
        ]
    };
    if (process.env.PROXY_ON === 'true') browserOptions.args.push(`--proxy-server=${proxyUrl}`);
    Requester.killSession(session);

    const browser = await puppeteer.launch(browserOptions);
    const page = await browser.newPage();
    await page.authenticate({ username: proxyCredentials[0], password: proxyCredentials[1] });
    await page.setDefaultNavigationTimeout(60000);

    try {
        // Search page
        const LOGIN_BUTTON = '#hyfMultiplus > nav > section > div.header-user-info.hyf-hidden-xs.hyf-visible-sm.hyf-visible-md.hyf-visible-lg > div > div.data-logout > div > a';
        await page.goto('https://www.pontosmultiplus.com/pt_br');
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
            var goingFlight = getFlightById(requested.response.Trechos[params.originAirportCode + params.destinationAirportCode].Voos, data.going_flight_id);

        if (data.returning_flight_id)
            var returningFlight = getFlightById(requested.response.Trechos[params.destinationAirportCode + params.originAirportCode].Voos, data.returning_flight_id);

        var goingFlightHtmlId = '#' + getCompleteFlightId(goingFlight);

        try {
            await page.waitFor(goingFlightHtmlId);
        } catch (e) {
            await page.reload();
            try {
                await page.waitFor(goingFlightHtmlId);
            } catch (e) {
                await page.reload();
                await page.waitFor(goingFlightHtmlId, {timeout: 60000});
            }
        }
        await page.waitFor(5000);
        await page.click(goingFlightHtmlId);

        // Verify price
        var farePriceSelector = '#appMain > div > div > div:nth-child(3) > div > div > section.container.flight-list > ul > ' +
            `li.flight.selected.cabin-${params.executive === 'true' ? 'J.fare-MPLUS_PREMIUM_BUSINESS_CLASSICO ' : 'Y.fare-MPLUS_CLASSICO '}` +
            '> div.collapsable-information.one-cabin > div > div:nth-child(1) ' +
            `> div > table > tfoot > tr > td.fare-${params.executive === 'true' ? 'MPLUS_PREMIUM_BUSINESS_CLASSICO' : 'MPLUS_CLASSICO'}.selected ` +
            '> div > div > label > span > span.value > span';
        var farePrice = await page.evaluate((selector) => {
            return $(selector)[0].innerText;
        }, farePriceSelector);
        farePrice = Number(farePrice.replace('.', ''));

        if (goingFlight.Milhas[0].Adulto > farePrice) {
            console.log('Price got higher.');
            return;
        }

        if (returningFlight) {
            await page.waitFor(2000);
            const CONTINUE_BUTTON = '#appMain > div > div > div:nth-child(3) > div > div > section.container.flight-list > ul > ' +
                `li.flight.selected.cabin-${params.executive === 'true' ? 'J.fare-MPLUS_PREMIUM_BUSINESS_CLASSICO ' : 'Y.fare-MPLUS_CLASSICO '}` +
                '> div.collapsable-information.one-cabin > div > div.collapsable-information-navigation.has-fare-selector > button';
            await page.click(CONTINUE_BUTTON);
            var returningFlightHtmlId = '#' + getCompleteFlightId(returningFlight);
            await page.waitFor(returningFlightHtmlId, {timeout: 60000});
            await page.waitFor(3000);
            await page.click(returningFlightHtmlId);

            var returningFarePrice = await page.evaluate((selector) => {
                return $(selector)[0].innerText;
            }, farePriceSelector);
            returningFarePrice = Number(returningFarePrice.replace('.', ''));

            if (returningFlight.Milhas[0].Adulto > returningFarePrice) {
                console.log('Price got higher.');
                return;
            }
        }

        await page.waitFor('#submit-flights');
        await page.waitFor(5000);
        await page.click('#submit-flights');

        // Itinerary page
        await page.waitFor('#check_condiciones', {timeout: 60000});
        await page.click('#check_condiciones');
        await page.click('#submitButton');

        // Verify token page
        await verifyTokenPage(browser, page, data, resolvePassengersPage);
    } catch (e) {
        res.status(500).json();
        console.log(e.stack);
        await page.screenshot({path: '/Users/anderson/Documents/Work/FlightCrawler/app/controllers/latamScreenshots/' + (new Date()).toISOString() + '.jpg', type: 'jpeg', fullPage: true, quality: 60});
        console.log('took screenshot');
    }
}

async function resolvePassengersPage(browser, page, data) {
    // Passengers page
    await page.waitFor('#cambiarDatos');
    await page.waitFor(3000);
    await page.click('#cambiarDatos');

    await fillPassengersInfo(data.passengers, page);

    // Contact
    await selectTextAndDelete(page, '#email');
    await page.keyboard.type(data.credentials.email);

    await selectTextAndDelete(page, '#id_telefono_celular_l1 > input');
    await page.keyboard.type('55');

    await selectTextAndDelete(page, '#id_telefono_celular_l3 > input.input.telefonos.telefono-celular.telefono-codigo-area');
    await page.keyboard.type(data.credentials.token.area_code);

    await selectTextAndDelete(page, '#id_telefono_celular_l5 > input');
    await page.keyboard.type(data.credentials.token.number);

    await page.click('#submitButton');
    await page.waitForNavigation();

    // Verify token page
    await verifyTokenPage(browser, page, data, resolvePaymentPage);
}

async function resolvePaymentPage(browser, page, data) {
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

    // TODO: click on the button

    await browser.close();
    console.log('closed');
}

async function fillPassengersInfo(passengers, page) {
    var iAdt = 1;
    var iChd = 1;
    for (let passenger of data.passengers) {
        if (passenger.type.toUpperCase() === 'ADT') iAdt++;
        else iChd++;

        var passengerSelectorPrefix = `#pax_${passenger.type.toUpperCase()}_${passenger.type.toUpperCase() === 'ADT' ? iAdt : iChd}`;
        await page.click(passengerSelectorPrefix + '_titulo');
        await page.select(passengerSelectorPrefix + '_titulo' + '_titulo',
            passenger.gender.toUpperCase() === 'M' ? '0' : (passenger.type.toUpperCase() === 'ADT' ? '1' : '2'));

        await selectTextAndDelete(page, passengerSelectorPrefix + '_nombre');
        await page.keyboard.type(passenger.name.first);

        await selectTextAndDelete(page, + passengerSelectorPrefix + '_primer_apellido');
        await page.keyboard.type(passenger.name.last);

        await selectTextAndDelete(page, passengerSelectorPrefix + '_ff_number');
        await page.select(passengerSelectorPrefix + '_ff_airline', '');

        await page.click(passengerSelectorPrefix + '_foid_tipo');
        await page.select(passengerSelectorPrefix + '_foid_tipo', (passenger.document.type === 'passport' ? 'PP' : 'NI'));
        await page.click(passengerSelectorPrefix + '_foid_numero');
        await page.keyboard.type(passenger.document.number);
    }
}

async function verifyTokenPage(browser, page, data, resolveFunction) {
    await page.waitFor(() => !!document.querySelector('#mplus_sdk_modal_content_232 > iframe') ||
        !!document.querySelector('#CREDIT_CARD_REGION') || !!document.querySelector('#cambiarDatos'), {});
    debugger;
    var isTokenPage = await page.evaluate(() => {
        return !!document.querySelector('#mplus_sdk_modal_content_232 > iframe');
    });
    if (isTokenPage) {
        await selectNumberAndSendToken(browser, page, data.credentials.token, resolveFunction);
    } else {
        resolveFunction(broswer, page, data);
    }
}

async function selectNumberAndSendToken(browser, page, token, resolveFunction) {
    var bodyHandle = await page.$('body');
    var html = await page.evaluate(body => body.innerHTML, bodyHandle);
    var $ = cheerio.load(html);

    var iFrameLink = $('#mplus_sdk_modal_content_232 > iframe').attr('src');
    await page.goto(iFrameLink);
    await page.waitFor('div.mat-SmsTab-root.js-active-tab > div > div:nth-child(1) > form > ul');

    bodyHandle = await page.$('body');
    html = await page.evaluate(body => body.innerHTML, bodyHandle);
    $ = cheerio.load(html);

    var numberSelectorList = $('#app > main > div > div.mat-SmsTab-root.js-active-tab > div > div:nth-child(1) > form > ul > li');
    for (let numberSelector of numberSelectorList[0].children) {
        var number = numberSelector.children[0].children[0].attribs.value.split(' ');
        if (number[0] === `(${token.area_code})` && number[1].split('-')[1] === token.number.substring(token.number.length - 4)) {
            var inputId = '#\\3' + numberSelector.children[0].children[0].attribs.id.split('-')[0] + ' -' + numberSelector.children[0].children[0].attribs.id.split('-')[1];
            await page.click(inputId);
            // await page.click('#app > main > div > div.mat-SmsTab-root.js-active-tab > div > div:nth-child(1) > form > div.clearfix > div.md-col.md-col-4.md-right-align > button');
            debugger;
            sessions.push({browser: browser, page: page, number: token});
            return;
        }
    }
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
