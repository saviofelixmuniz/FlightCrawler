/**
 * @author Sávio Muniz
 */
var express = require('express');
var Proxy = require('../helpers/proxy');
var test = require('../helpers/airport-taxes/tax-crawler');
var rootRouter = express.Router();
var Airports = require('../db/models/airports');
var gol = require('./flight/gol.route');
var avianca = require('./flight/avianca.route');
var azul = require('./flight/azul.route');
var latam = require('./flight/latam.route');
var stats = require('./flight/stats.route');
var skymilhas = require('./flight/skymilhas');
var auth = require('./flight/auth.route');
var cheerio = require('cheerio');
var rp = require('request-promise');

rootRouter.get('/', function(req, res, next) {
    res.send('respond with a resource');
});

rootRouter.use('/gol', gol);
rootRouter.use('/avianca',avianca);
rootRouter.use('/azul',azul);
rootRouter.use('/latam',latam);
rootRouter.use('/skymilhas',skymilhas);

rootRouter.use('/stats', stats);
rootRouter.use('/auth', auth);

rootRouter.get('/test', async function oi (req, res) {
    var token = await rp.post({url: 'https://www.avianca.com.br/api/jsonws/aviancaservice.tokenasl/get-customer-token',
                 headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                 },
                 form: {
                    'clientUsername': '',
                     'documentNumber': '74221172657',
                     'flyerId': '',
                     'clientPassword': 'Peidei2@18',
                     'userType': 'customer'
                 }});
    console.log('...first');
    token = JSON.parse(token);
    var info = await rp.get({url: 'https://api.avianca.com.br/security/account/info?access_token=' + token.accessToken});
    console.log('...second');
    var loginForm = {'_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_formDate': '1531279951313',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_Login': 'fakeliferay@avianca.com',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_Senha': 'amigo',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_UserType': 'customer',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_Redirect': '/verificar-amigo',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_AVIANCA_USER_FIRSTNAME': 'Fabrício',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_AVIANCA_USER_LASTNAME': 'Souza Cruz Almeida',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_AVIANCA_USER_EMAIL': 'arthur.srmviagens@gmail.com',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_AVIANCA_USER_LOGIN': '',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_AVIANCA_USER_BIRTHDATE_DAY': '6',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_AVIANCA_USER_BIRTHDATE_MONTH': '9',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_AVIANCA_USER_BIRTHDATE_YEAR': '1985',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_AVIANCA_USER_OPTIN_AMIGO': 'true',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_AVIANCA_USER_NEWSLETTER': 'true',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_AVIANCA_USER_REDIRECT_LANG': 'pt_BR',
                    '_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_AVIANCA_USER_PASSWORD': 'Peidei2@18'};
    var jar = rp.jar();
    await rp.post({
        url: 'https://www.avianca.com.br/login-avianca?p_p_id=com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB&p_p_lifecycle=1&p_p_state=normal&p_p_mode=view&p_p_col_id=column-1&p_p_col_pos=2&p_p_col_count=4&_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_javax.portlet.action=doLogin&p_auth=8lIHnGml',
        form: loginForm,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        jar: jar
    });
    console.log('...third');
    var url = await rp.get('https://api.avianca.com.br/farecommercialization/generateurl/ORG=AJU&DST=BHZ&OUT_DATE=20180720&IN_DATE=20180725&LANG=BR&COUNTRY=BR&QT_ADT=1&QT_CHD=0&QT_INF=0&FLX_DATES=true&CABIN=Award&PERIOD_OUT_WINDOW=undefined&PERIOD_IN_WINDOW=undefined&SOURCE=DESKTOP_REDEMPTION?access_token=' + token.accessToken);
    console.log('...forth');
    var html = await rp.get(JSON.parse(url).payload.url);
    console.log('...fifth');
    var $ = cheerio.load(html);

    var flights = {going: {}, returning: {}};

    var tbody = $('tbody','#fpcTableFareFamilyContent_out');
    tbody.children().each(function () {
        var tr = $(this);
        var miles = tr.find('td.col2');
        if (miles.length === 0)
            return;

        var splitPointsArray = miles.text().split(' Pontos')[0].split('\n');
        miles = Number(splitPointsArray[splitPointsArray.length - 1].trim());
        console.log(miles);

        var flightInfo = tr.find('.col1').find('.tableFPCFlightDetails').find('tr');
        var time = flightInfo.eq(1).children().eq(0).text().split('\n')[1].trim();
        var flightNumber = flightInfo.eq(0).children().eq(2).text().split('Avianca Brasil (')[1].split(')')[0];

        flights.going[flightNumber + time] = miles;
    });

    var tbody = $('tbody','#fpcTableFareFamilyContent_in');
    tbody.children().each(function () {
        var tr = $(this);
        var miles = tr.find('td.col2');
        debugger;
        if (miles.length === 0)
            return;

        var splitPointsArray = miles.text().split(' Pontos')[0].split('\n');
        miles = Number(splitPointsArray[splitPointsArray.length - 1].trim());
        console.log(miles);

        var flightInfo = tr.find('.col1').find('.tableFPCFlightDetails').find('tr');
        var time = flightInfo.eq(1).children().eq(0).text().split('\n')[1].trim();
        var flightNumber = flightInfo.eq(0).children().eq(2).text().split('Avianca Brasil (')[1].split(')')[0];

        flights.returning[flightNumber + time] = miles;
    });
    res.json(flights);
});
rootRouter.get('/proxytest', async function proxyTest (req, res) {
    var ip = await Proxy.setupAndRotateRequestLib('request-promise', 'onecompany').get('https://api.ipify.org?format=json');
    res.json(JSON.parse(ip));
});

module.exports = rootRouter;