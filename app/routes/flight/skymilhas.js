/**
 * @author Sávio Muniz
 */
var express = require('express');
var skyRouter = express.Router();
var skyMilhas = require('../../controllers/skymilhas');

skyRouter.put('/', skyMilhas);

module.exports = skyRouter;