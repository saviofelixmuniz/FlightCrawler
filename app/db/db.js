/**
 * @author Sávio Muniz
 */
const mongoose = require('mongoose');
const CONSTANTS = require('../helpers/constants');

mongoose.connect(CONSTANTS.DATABASE, { useNewUrlParser: true });

mongoose.connection.on('connected', function () {
    console.log('Mongoose connected to ' + CONSTANTS.DATABASE);
});

mongoose.connection.on('error', function (err) {
    console.log('Mongoose connection error: ' + err);
});

mongoose.connection.on('disconnected', function () {
    console.log('Mongoose disconnected');
});

// Models