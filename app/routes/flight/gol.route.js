/**
 * @author Sávio Muniz
 */
var express = require('express');
var golRouter = express.Router();
var golController = require('../../controllers/gol.controller');
var golEmissionController = require('../../controllers/gol-emission.controller');
var emissionController = require('../../controllers/emission.controller');
var verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

golRouter.get('/', verifyAPIAuth, golController.getFlightInfo);
golRouter.get('/tax', verifyAPIAuth, golController.getTax);
golRouter.get('/emission_report/:id', verifyAPIAuth, emissionController.getEmissionReport);
golRouter.post('/issue_ticket', verifyAPIAuth, golEmissionController.issueTicket);

module.exports = golRouter;