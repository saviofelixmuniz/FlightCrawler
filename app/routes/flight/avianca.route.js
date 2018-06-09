/**
 * @author Sávio Muniz
 */
var express = require('express');
var aviancaRouter = express.Router();
var aviancaController = require('../../controllers/avianca.controller');
var verifyAPIAuth = require('../../helpers/api-auth').checkReqAuth;

aviancaRouter.get('/', verifyAPIAuth, aviancaController);

module.exports = aviancaRouter;