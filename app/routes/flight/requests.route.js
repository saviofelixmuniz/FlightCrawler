/**
 * @author Sávio Muniz
 */
var express = require('express');
var requestRouter = express.Router();
var requestController = require('../../controllers/request.controller');
var verifyAPIAuth = require('../../util/security/api-auth').checkReqAuth;

requestRouter.get('/:id', verifyAPIAuth, requestController.getRequest);
requestRouter.get('/:id/params', verifyAPIAuth, requestController.getRequestParams);

module.exports = requestRouter;