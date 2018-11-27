/**
 * @author Sávio Muniz
 */
var express = require('express');
var confiancaRouter = express.Router();
var confiancaController = require('../../controllers/confianca.controller');
var verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

confiancaRouter.get('/', verifyAPIAuth, confiancaController);

module.exports = confiancaRouter;