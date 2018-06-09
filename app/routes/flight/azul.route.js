/**
 * @author Sávio Muniz
 */
var express = require('express');
var azulRouter = express.Router();
var azulController = require('../../controllers/azul.controller');
var verifyAPIAuth = require('../../helpers/api-auth').checkReqAuth;

azulRouter.get('/', verifyAPIAuth, azulController);

module.exports = azulRouter;