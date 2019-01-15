/**
 * @author Sávio Muniz
 */
var express = require('express');
var aviancaRouter = express.Router();
var aviancaController = require('../../controllers/avianca.controller');
var verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

aviancaRouter.get('/', verifyAPIAuth, aviancaController.getFlightInfo);
aviancaRouter.get('/tax', verifyAPIAuth, aviancaController.getTax);
aviancaRouter.get('/checkin', verifyAPIAuth, aviancaController.checkin);

module.exports = aviancaRouter;