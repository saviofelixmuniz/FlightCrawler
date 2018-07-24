/**
 * @author Sávio Muniz
 */
let express = require('express');
let golRouter = express.Router();
let golController = require('../../controllers/gol.controller');
let verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

golRouter.get('/', verifyAPIAuth, golController);

module.exports = golRouter;