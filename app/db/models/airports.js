/**
 * @author Anderson Menezes
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const airportSchema = Schema({
    code: {
        type: String,
        required: true
    },
    tax: {
        type : Number,
        required: true
    },
    updated_at: Date,
    searched_at: Date,
    company: {
        type: String,
        required: true,
        enum : ['gol', 'latam', 'azul', 'avianca']
    }
}, {collection : 'airports'});

module.exports = mongoose.model('Airport', airportSchema);