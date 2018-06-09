/**
 * @author Sávio Muniz
 */
var express = require('express');
var latamRouter = express.Router();
var latamController = require('../../controllers/latam.controller');
var verifyAPIAuth = require('../../helpers/api-auth').checkReqAuth;

latamRouter.get('/', verifyAPIAuth, latamRouter);

module.exports = latamController;