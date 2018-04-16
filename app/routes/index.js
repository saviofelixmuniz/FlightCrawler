/**
 * @author Sávio Muniz
 */
var express = require('express');
var rootRouter = express.Router();
var gol = require('./flight/gol.route');
var avianca = require('./flight/avianca.route');
var azul = require('./flight/azul.route');
var latam = require('./flight/latam.route');
var stats = require('./flight/stats.route');

rootRouter.get('/', function(req, res, next) {
    res.send('respond with a resource');
});

rootRouter.use('/gol', gol);
rootRouter.use('/avianca',avianca);
rootRouter.use('/azul',azul);
rootRouter.use('/latam',latam);

rootRouter.use('/stats', stats);


module.exports = rootRouter;