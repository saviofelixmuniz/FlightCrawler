/**
 * @author Sávio Muniz
 */
var express = require('express');
var azulRouter = express.Router();
var azulController = require('../../controllers/azul.controller');
var azulEmissionController = require('../../controllers/azul-emission.controller');
var verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

azulRouter.get('/', verifyAPIAuth, azulController.getFlightInfo);
azulRouter.get('/emission_report/:id', verifyAPIAuth, azulEmissionController.getEmissionReport);
azulRouter.post('/issue_ticket', verifyAPIAuth, azulEmissionController.issueTicket);

module.exports = azulRouter;