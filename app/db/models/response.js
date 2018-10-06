/**
 * @author Sávio Muniz
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const responseSchema = Schema({
    id_request : Schema.ObjectId,
    results: Schema.Types.Mixed,
    busca: Schema.Types.Mixed,
    trechos: Schema.Types.Mixed
}, {collection : 'responses'});

module.exports = mongoose.model('Response', responseSchema);