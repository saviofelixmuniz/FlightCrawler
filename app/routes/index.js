/**
 * @author Sávio Muniz
 */
let express = require('express');
let Proxy = require('../util/services/proxy');
let test = require('../util/airports/taxes/tax-crawler');
let rootRouter = express.Router();
let Airports = require('../db/models/airports');
let gol = require('./flight/gol.route');
let avianca = require('./flight/avianca.route');
let azul = require('./flight/azul.route');
let latam = require('./flight/latam.route');
let stats = require('./flight/stats.route');
let skymilhas = require('./flight/skymilhas');
let auth = require('./flight/auth.route');
let Unicorn = require('../util/services/unicorn/unicorn');
let cheerio = require('cheerio');
let rp = require('request-promise');

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
    res.send(await Unicorn({
        adults: req.query.adults,
        children: req.query.children,
        departureDate: req.query.departureDate,
        returnDate: req.query.returnDate,
        originAirportCode: req.query.originAirportCode,
        destinationAirportCode: req.query.destinationAirportCode,
        infants: 0,
        executive: req.query.executive === 'true'
    }, 'latam'))
});
rootRouter.get('/proxytest', async function proxyTest (req, res) {
    let ip = await Proxy.setupAndRotateRequestLib('request-promise', 'onecompany').get('https://api.ipify.org?format=json');
    res.json(JSON.parse(ip));
});

module.exports = rootRouter;