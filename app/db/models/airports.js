/**
 * @author Anderson Menezes
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const airportSchema = Schema({
    code : {
        type: String,
        required: true
    },
    tax : {
        type : Number,
        required: true
    },
    date : Date,
    companies : {
        type: [String]
    }
}, {collection : 'airports'});

module.exports = mongoose.model('Airport', airportSchema);