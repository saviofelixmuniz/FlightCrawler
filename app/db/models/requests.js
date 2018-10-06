/**
 * @author Sávio Muniz
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const requestSchema = Schema({
    company : {
        type: String,
        required: true,
        enum : ['gol', 'latam', 'azul', 'avianca']
    },
    http_status : {
        type : Number,
        required: true
    },
    log : String,
    params : {
        required : true,
        type : Schema.Types.Mixed
    },
    date : Date,
    time : Number,
    response: Boolean
}, {collection : 'requests'});

module.exports = mongoose.model('Request', requestSchema);