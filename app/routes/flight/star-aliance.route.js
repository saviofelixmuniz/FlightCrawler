/**
 * @author Maiana Brito
 */
var express = require('express');
var starAlianceRouter = express.Router();
var starAlianceController = require('../../controllers/star-aliance.controller');
var verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

starAlianceRouter.get('/', verifyAPIAuth, starAlianceController.getFlightInfo);
//starAlianceRouter.get('/tax', verifyAPIAuth, starAlianceController.getTax);

module.exports = starAlianceRouter;