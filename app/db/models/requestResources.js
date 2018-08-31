/**
 * @author Anderson Menezes
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const requestResourcesSchema = Schema({
    requestId : {
        type: Schema.Types.ObjectId,
        required: true,
        unique: true
    },
    headers : {
        type : Schema.Types.Mixed
    },
    cookieJar : {
        type : Schema.Types.Mixed
    },
    resources : {
        type : Schema.Types.Mixed
    }
}, {collection : 'request_resources'});

module.exports = mongoose.model('RequestResources', requestResourcesSchema);