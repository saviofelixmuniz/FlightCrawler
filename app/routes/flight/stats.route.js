/**
 * @author Sávio Muniz
 */
let express = require('express');
let statsRouter = express.Router();
let statsController = require('../../controllers/stats.controller');
let verifyJWT = require('../../controllers/auth.controller').verifyToken;

statsRouter.get('/response_time', verifyJWT, statsController.getResponseTime);
statsRouter.get('/requests/total', verifyJWT, statsController.getRequestSuccessRateAPI);
statsRouter.get('/requests/logs', verifyJWT, statsController.getRequestLogs);
statsRouter.get('/requests/detailed', verifyJWT, statsController.getDetailedRequestStats);
statsRouter.get('/requests/top_economy', statsController.getTopEconomy);

module.exports = statsRouter;