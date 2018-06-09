/**
 * @author Sávio Muniz
 */
var jwt = require('jsonwebtoken');
var util = require('util');
var bcrypt = require('bcryptjs');
var User = require('../db/models/users');
var CONSTANTS = require('../helpers/constants');
var Time = require('../helpers/time-utils');

module.exports = {
    register: register,
    me: me,
    login: login,
    verifyToken: verifyToken
};

const EXPIRATION_TIME = Time.transformTimeUnit('week', 'second', 1);

async function register(req, res) {
    if(await User.isEmailTaken(req.body.email)){
        res.status(400).json({err: 'Email is already taken'});
    }

    var hashedPassword = bcrypt.hashSync(req.body.password, 8);

    var userObj = {
        name: req.body.name,
        role: req.body.role,
        email: req.body.email,
        password: hashedPassword
    };

    User.create(userObj)
        .then(function (user) {
            var token = jwt.sign({id: user._id}, CONSTANTS.APP_SECRET, {expiresIn: EXPIRATION_TIME});
            res.status(200).send({user: user, token: token});
        })
        .catch(function (err) {
            res.status(500).json({err: err});
        });
}

async function me(req, res) {
    res.json(req.user);
}

async function login(req, res) {
    User.findOne({email : req.body.email}, function (err, user) {
        if (!user) return res.status(404).json({err : 'No such user'});
        if (!bcrypt.compareSync(req.body.password, user.password))
            return res.status(401).json({err : 'Wrong password'});

        var token = jwt.sign({id: user._id}, CONSTANTS.APP_SECRET, {expiresIn: EXPIRATION_TIME});

        res.status(200).send({user: user, jwt: token});
    });
}

async function verifyToken(req, res, next) {
    var token = req.headers['authorization'];
    if (!token)
        return res.status(401).json({ err: 'No token provided.' });
    jwt.verify(token, CONSTANTS.APP_SECRET, function(err, decoded) {
        if (err)
            return res.status(401).json({ err: 'Failed to authenticate token.' });

        var expirationDate = new Date(decoded.exp * 1000);

        if (new Date() > expirationDate) {
            res.status(401).send({err: 'Token is expired.'});
        }

        var userId = decoded.id;

        User.findOne({_id: userId}, function (err, user) {
            req.user = user;
            next();
        });
    });
}