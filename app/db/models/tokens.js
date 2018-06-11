/**
 * @author Sávio Muniz
 */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Time = require('../../helpers/time-utils');

const tokenSchema = Schema({
    token: {
        required: true,
        type: String,
        unique: true
    },
    created_by: {
        required: true,
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    expiration_date: {
        required: true,
        type: Date,
        default: threeDaysFromNow()
    },
    activated_to: {
        required: false,
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    role: {
        type: String,
        enum: ['regular', 'admin'],
        default: 'regular'
    }
}, {collection : 'tokens'});

module.exports = mongoose.model('Token', tokenSchema);

function threeDaysFromNow() {
    return new Date(new Date().getTime() + Time.transformTimeUnit('day', 'mili', 3));
}