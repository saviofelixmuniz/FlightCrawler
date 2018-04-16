/**
 * @author Sávio Muniz
 */
var express = require('express');
var statsRouter = express.Router();
var statsController = require('../../controllers/stats.controller');

statsRouter.get('/response_time', statsController.getResponseTime);
statsRouter.get('/requests/total', statsController.getRequestSuccessRate);
statsRouter.get('/requests/logs', statsController.getRequestLogs);
statsRouter.get('/requests/detailed', statsController.getDetailedRequestStats);

module.exports = statsRouter;