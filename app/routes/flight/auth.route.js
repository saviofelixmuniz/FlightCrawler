/**
 * @author Sávio Muniz
 */
let express = require('express');
let authRouter = express.Router();
let authController = require('../../controllers/auth.controller');

authRouter.post('/register', authController.register);
authRouter.get('/me', authController.verifyToken, authController.me);
authRouter.post('/login', authController.login);
authRouter.post('/token', authController.verifyToken, authController.createRegisterToken);

module.exports = authRouter;