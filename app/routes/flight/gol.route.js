/**
 * @author Sávio Muniz
 */
var express = require('express');
var golRouter = express.Router();
var golController = require('../../controllers/gol.controller');
var verifyAPIAuth = require('../../helpers/api-auth').checkReqAuth;

golRouter.get('/', verifyAPIAuth, golController);

module.exports = golRouter;