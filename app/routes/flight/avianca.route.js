/**
 * @author Sávio Muniz
 */
var express = require('express');
var aviancaRouter = express.Router();
var aviancaController = require('../../controllers/avianca.controller')

aviancaRouter.get('/', aviancaController);

module.exports = aviancaRouter;