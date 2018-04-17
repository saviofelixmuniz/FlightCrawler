/**
 * @author Sávio Muniz
 */
var express = require('express');
var skyRouter = express.Router();
var skyMilhas = require('../../controllers/skymilhas');

skyRouter.post('/', skyMilhas);

module.exports = skyRouter;