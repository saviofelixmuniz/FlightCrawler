/**
 * @author Sávio Muniz
 */
let jwt = require('jsonwebtoken');
let bcrypt = require('bcryptjs');
let User = require('../db/models/users');
let Token = require('../db/models/tokens');
let CONSTANTS = require('../util/helpers/constants');
let Time = require('../util/helpers/time-utils');
let CodeGenerator = require('../util/security/token-generator');

module.exports = {
    register: register,
    me: me,
    login: login,
    verifyToken: verifyToken,
    createRegisterToken: createRegisterToken
};

const EXPIRATION_TIME = Time.transformTimeUnit('week', 'second', 1);

async function register(req, res) {
    let regToken = await checkAndGetToken(req, res);

    if(await User.isEmailTaken(req.body.email)){
        res.status(400).json({err: 'Email is already taken'});
    }

    let hashedPassword = bcrypt.hashSync(req.body.password, 8);

    let userObj = {
        name: req.body.name,
        role: regToken.role,
        email: req.body.email,
        password: hashedPassword
    };

    User.create(userObj)
        .then(function (user) {
            let jwtToken = jwt.sign({id: user._id}, CONSTANTS.APP_SECRET, {expiresIn: EXPIRATION_TIME});

            regToken.activated_to = user._id;
            regToken.save().then(function () {
                res.status(200).send({user: user, jwt: jwtToken});
            }).catch(function (err) {
                res.status(500).json({err: err});
            });
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

        let token = jwt.sign({id: user._id}, CONSTANTS.APP_SECRET, {expiresIn: EXPIRATION_TIME});

        res.status(200).send({user: user, jwt: token});
    });
}

async function verifyToken(req, res, next) {
    let token = req.headers['authorization'];
    if (!token)
        return res.status(401).json({ err: 'No token provided.' });
    jwt.verify(token, CONSTANTS.APP_SECRET, function(err, decoded) {
        if (err)
            return res.status(401).json({ err: 'Failed to authenticate token.' });

        let expirationDate = new Date(decoded.exp * 1000);

        if (new Date() > expirationDate) {
            res.status(401).send({err: 'Token is expired.'});
        }

        let userId = decoded.id;

        User.findOne({_id: userId}, function (err, user) {
            req.user = user;
            next();
        });
    });
}

async function checkAndGetToken(req, res) {
    if (!req.body.token) {
        res.status(401).json({err: 'No token provided'});
    }

    let token = await Token.findOne({'token': req.body.token});

    if (!token) {
        res.status(401).json({err: 'Token is invalid'});
    }

    else if (token.expiration_date < new Date()) {
        res.status(401).json({err: 'Token is expired'});
    }

    else if (token.activated_to)
        res.status(401).json({err: 'Token was already used'});

    else
        return token;
}

async function createRegisterToken(req, res) {
    let unique = false;
    let token = CodeGenerator(5);

    if (req.user.role !== 'admin')
        res.status(401).json({err: 'This user is not authorized to create tokens'});

    while (!unique) {
        let existingToken = await Token.findOne({token: token});

        if (existingToken) {
            token = CodeGenerator(5);
        }

        else
            unique = true;
    }

    let tokenObj = {
        token: token,
        role: req.body.role,
        activated_to: null,
        created_by: req.user._id
    };
    
    Token.create(tokenObj).then(function (token) {
        res.status(200).json({token: token.token, message: 'Token created successfully'});
    });
}
