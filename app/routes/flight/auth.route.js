/**
 * @author Sávio Muniz
 */
var express = require('express');
var authRouter = express.Router();
var authController = require('../../controllers/auth.controller');

authRouter.post('/register', authController.register);
authRouter.get('/me', authController.verifyToken, authController.me);
authRouter.post('/login', authController.login);

module.exports = authRouter;