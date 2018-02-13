/**
 * @author Sávio Muniz
 */
var express = require('express');
var azulRouter = express.Router();
var azulController = require('../../controllers/azul.controller')

azulRouter.get('/', azulController);

module.exports = azulRouter;