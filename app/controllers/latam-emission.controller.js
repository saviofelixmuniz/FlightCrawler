/**
 * @author Anderson Menezes
 */
module.exports = {
    getAccountBalance: getAccountBalance,
    getBalanceStatus: getBalanceStatus
};

const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
const Requirer =require ('../util/services/requester');
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

            // TODO: make the date dynamic (ex: today + one year)
            var searchUrl = formatUrl({adults: '1', children: '0', departureDate: '2019-12-01', originAirportCode: 'SAO', destinationAirportCode: 'RIO'});
            var searchRes = await Requirer.require({
                session: pSession,
                request: {
                    url: searchUrl
                }
            });

            var loginPageUrl = 'https://www.latam.com/cgi-bin/site_login.cgi?page=' + searchUrl;
            var loginPageRes = await Requirer.require({
                session: pSession,
                request: {
                    url: loginPageUrl
                }
            });

            var extraParam = getExtraParam(loginPageRes);
            var loginUrl = 'https://www.latam.com/cgi-bin/login/login_latam.cgi';
            var loginRes = await Requirer.require({
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