/**
 * @author Sávio Muniz
 */
var express = require('express');
var emissionRouter = express.Router();
var emissionController = require('../../controllers/emission.controller');
var verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

emissionRouter.get('/report/:id', verifyAPIAuth, emissionController.getEmissionReport);
emissionRouter.post('/cancel', verifyAPIAuth, emissionController.cancelEmission);

module.exports = emissionRouter;