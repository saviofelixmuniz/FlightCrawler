/**
 * @author Sávio Muniz
 */
var express = require('express');
var golRouter = express.Router();
var golController = require('../../controllers/gol.controller');
var verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

golRouter.get('/', verifyAPIAuth, golController.getFlightInfo);
golRouter.get('/tax', verifyAPIAuth, golController.getTax);

module.exports = golRouter;