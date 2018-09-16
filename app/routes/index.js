/**
 * @author Sávio Muniz
 */
var express = require('express');
var Proxy = require('../util/services/proxy');
var test = require('../util/airports/taxes/tax-crawler');
var Confianca = require('../util/helpers/confianca-crawler');
var rootRouter = express.Router();
var Airports = require('../db/models/airports');
var taxObtainer = require('../util/airports/taxes/tax-obtainer');
var gol = require('./flight/gol.route');
var avianca = require('./flight/avianca.route');
var azul = require('./flight/azul.route');
var latam = require('./flight/latam.route');
var stats = require('./flight/stats.route');
var auth = require('./flight/auth.route');
var requests = require('./flight/requests.route');

rootRouter.get('/', function(req, res, next) {
    res.send('respond with a resource');
});

rootRouter.use('/gol', gol);
rootRouter.use('/avianca',avianca);
rootRouter.use('/azul',azul);
rootRouter.use('/latam',latam);
rootRouter.use('/requests', requests);

rootRouter.use('/stats', stats);
rootRouter.use('/auth', auth);

rootRouter.get('/test', async function (req, res) {

});



rootRouter.get('/proxytest', async function proxyTest (req, res) {
    var ip = await Proxy.setupAndRotateRequestLib('request-promise', 'onecompany').get('https://api.ipify.org?format=json');
    res.json(JSON.parse(ip));
});

module.exports = rootRouter;

