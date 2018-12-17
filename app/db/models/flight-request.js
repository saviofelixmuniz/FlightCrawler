/**
 * @author Maiana Brito
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const flightRequestSchema = Schema({
    response_id : {
        type: Schema.Types.ObjectId,
        required: true
    },
    flight_id : {
        type: Schema.Types.ObjectId
    }
}, {collection : 'flight_request'});

module.exports = mongoose.model('FlightRequest', flightRequestSchema);