/**
 * @author Sávio Muniz
 */
let express = require('express');
let skyRouter = express.Router();
let skyMilhas = require('../../controllers/skymilhas');

skyRouter.post('/', skyMilhas);

module.exports = skyRouter;