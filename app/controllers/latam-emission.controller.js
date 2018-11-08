/**
 * @author Anderson Menezes
 */
module.exports = {
    issueTicket: issueTicket
};

const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
const Proxy = require ('../util/services/proxy');
const cheerio = require('cheerio');

function formatUrl(params) {
    return 'https://www.latam.com/pt_br/apps/multiplus/booking?application=lanpass' +
        `&from_city1=${params.originAirportCode}&to_city1=${params.destinationAirportCode}` +
        (!params.returnDate ? '' : (`&from_city2=${params.destinationAirportCode}&to_city2=${params.originAirportCode}` +
        `&fecha2_dia=${params.returnDate.split('-')[2]}&fecha2_anomes=${params.returnDate.split('-')[0] + '-' + params.returnDate.split('-')[1]}`)) +
        `&fecha1_dia=${params.departureDate.split('-')[2]}&fecha1_anomes=${params.departureDate.split('-')[0] + '-' + params.departureDate.split('-')[1]}` +
        `&ida_vuelta=${params.returnDate ? 'ida_vuelta' : 'ida'}&nadults=${params.adults}&nchildren=${params.children}&ninfants=0&cabina=Y`;
}

function getExtraParam(loginPage) {
    var $ = cheerio.load(loginPage);
    var extraParam = $('#extraParam').attr('value');
    return extraParam;
}

async function issueTicket(req, res, next) {
    var balance = await getAccountBalance(req);
    debugger;

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
                'login': data.credentials.login,
                'password': data.credentials.password,
                'extraParam': extraParam
            }
        }
    });

    var authToken = getAuthTokenFromBody(loginRes);
    var loginRedirectUrl = getRedirectUrlFromBody(loginRes);

    var redirectedLoginRes = await Proxy.require({
        session: pSession,
        request: {
            url: loginRedirectUrl,
            resolveWithFullResponse: true
        }
    });

    debugger;

    var sessionLoginUrl = getSessionLoginUrlFromBody(redirectedLoginRes);
    var redirectedSearchUrl = getRedirectUrlFromBody(redirectedLoginRes);

    var sessionLoginRes = await Proxy.require({
        session: pSession,
        request: {
            url: sessionLoginUrl
        }
    });

    var redirectedSearchRes = await Proxy.require({
        session: pSession,
        request: {
            url: redirectedSearchUrl
        }
    });
}

async function getAccountBalance(req) {
    var map = {};
    var pSession = Proxy.createSession('latam');
    var data = req.body;
    var accounts = data.accounts.split('\n');
    debugger;

    var requested = await db.getRequest(data.request_id);
    var resources = await db.getRequestResources(data.request_id);
    var params = requested.params;

    if (!requested) {
        Proxy.killSession(pSession);
        res.status(404);
        res.json();
        return;
    }

    for (let row of accounts) {
        try {
            pSession = Proxy.createSession('latam');

            var name = row.split('       ')[0].trim();
            var login = row.split('       ')[1].trim();
            var password = row.split('       ')[2].trim();

            var searchUrl = formatUrl(params);
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
                    }
                }
            });

            var authToken = getAuthTokenFromBody(loginRes);
            var loginRedirectUrl = getRedirectUrlFromBody(loginRes);

            var redirectedLoginRes = await Proxy.require({
                session: pSession,
                request: {
                    url: loginRedirectUrl,
                    resolveWithFullResponse: true
                }
            });

            var header = null;
            for (let h of redirectedLoginRes.headers['set-cookie']) {
                if (h.indexOf('user_data') !== -1) {
                    header = h;
                    break;
                }
            }

            var info = decodeURIComponent(header).split(';');
            for (let i of info) {
                if (Number(i)) {
                    map[name] = Number(i);
                }
            }

            Proxy.killSession(pSession);

            if (map[name] === undefined || map[name] === null) {
                console.log('erro: ' + row);
                continue;
            }
            console.log(name + ': ' + map[name]);
        } catch (e) {
            console.log('erro: ' + row);
        }
    }

    debugger;

}

function getFromBody(body, key, startSymbol, endSymbol) {
    var result = '';
    var started = false;
    for (let i = body.indexOf(key); i < body.length; i++) {
        if (!started) {
            if (body[i] === startSymbol) started = true;
        } else {
            if (body[i] === endSymbol) break;
            result += body[i];
        }
    }

    return result;
}

function getAuthTokenFromBody(body) {
    return getFromBody(body, 'auth_token', '=', ';');
}

function getRedirectUrlFromBody(body) {
    return getFromBody(body, 'window.location=', '"', '"');
}

function getSessionLoginUrlFromBody(body) {
    return getFromBody(body, 'iframe', '"', '"');
}