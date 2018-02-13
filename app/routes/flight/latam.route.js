/**
 * @author Sávio Muniz
 */
var express = require('express');
var latamRouter = express.Router();
var latamController = require('../../controllers/latam.controller')

latamRouter.get('/', latamRouter);

module.exports = latamController;