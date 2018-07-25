/**
 * @author Sávio Muniz
 */
var express = require('express');
var latamRouter = express.Router();
var latamController = require('../../controllers/latam.controller');
var verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

latamRouter.get('/', verifyAPIAuth, latamController);

module.exports = latamRouter;