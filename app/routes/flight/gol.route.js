/**
 * @author Sávio Muniz
 */
/**
 * @author Sávio Muniz
 */
var express = require('express');
var golRouter = express.Router();
var golController = require('../../controllers/gol.controller')

golRouter.get('/', golController);

module.exports = golRouter;