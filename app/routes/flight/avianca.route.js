/**
 * @author Sávio Muniz
 */
let express = require('express');
let aviancaRouter = express.Router();
let aviancaController = require('../../controllers/avianca.controller');
let verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

aviancaRouter.get('/', verifyAPIAuth, aviancaController);

module.exports = aviancaRouter;