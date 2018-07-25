/**
 * @author Sávio Muniz
 */
var express = require('express');
var azulRouter = express.Router();
var azulController = require('../../controllers/azul.controller');
var verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

azulRouter.get('/', verifyAPIAuth, azulController);

module.exports = azulRouter;