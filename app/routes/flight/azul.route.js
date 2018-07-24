/**
 * @author Sávio Muniz
 */
let express = require('express');
let azulRouter = express.Router();
let azulController = require('../../controllers/azul.controller');
let verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

azulRouter.get('/', verifyAPIAuth, azulController);

module.exports = azulRouter;