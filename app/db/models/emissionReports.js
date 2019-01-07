/**
 * @author Anderson Menezes
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const emissionReportsSchema = Schema({
    request_id : {
        type: Schema.Types.ObjectId,
        required: true
    },
    progress : {
        type: Schema.Types.Mixed
    },
    results : {
        type: Schema.Types.Mixed
    },
    data : {
        type: Schema.Types.Mixed
    },
    company : {
        type: String,
        required: true,
        enum : ['gol', 'latam', 'azul', 'avianca']
    },
    log : String,
    response : String,
    date : Date,
    end : Date
}, {collection : 'emission_reports'});

module.exports = mongoose.model('EmissionReports', emissionReportsSchema);