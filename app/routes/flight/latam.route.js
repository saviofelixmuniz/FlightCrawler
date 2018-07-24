/**
 * @author Sávio Muniz
 */
let express = require('express');
let latamRouter = express.Router();
let latamController = require('../../controllers/latam.controller');
let verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

latamRouter.get('/', verifyAPIAuth, latamController);

module.exports = latamRouter;