var express = require('express');
var propsRouter = express.Router();
var propsController = require('../../controllers/props.controller');
var verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

propsRouter.post('/key', verifyAPIAuth, propsController.createAPIKey);

module.exports = propsRouter;