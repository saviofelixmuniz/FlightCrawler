/**
 * @author Sávio Muniz
 */
var express = require('express');
var statsRouter = express.Router();
var statsController = require('../../controllers/stats.controller');
var verifyJWT = require('../../controllers/auth.controller').verifyToken;

statsRouter.get('/response_time', verifyJWT, statsController.getResponseTime);
statsRouter.get('/requests/total', verifyJWT, statsController.getRequestSuccessRateAPI);
statsRouter.get('/requests/logs', verifyJWT, statsController.getRequestLogs);
statsRouter.get('/requests/detailed', verifyJWT, statsController.getDetailedRequestStats);
statsRouter.get('/requests/top_economy', statsController.getTopEconomy);

module.exports = statsRouter;