/**
 * @author Sávio Muniz
 */
var express = require('express');
var latamRouter = express.Router();
var latamController = require('../../controllers/latam.controller');
var latamEmissionController = require('../../controllers/latam-emission.controller');
var verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

latamRouter.get('/', verifyAPIAuth, latamController);
latamRouter.post('/issue_ticket', verifyAPIAuth, latamEmissionController.issueTicket());
latamRouter.post('/accounts_balance', verifyAPIAuth, latamEmissionController.getAccountBalance);
latamRouter.get('/balance_status', verifyAPIAuth, latamEmissionController.getBalanceStatus);

module.exports = latamRouter;