/**
 * @author Sávio Muniz
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const propertiesSchema = Schema({
    key: String,
    value: Schema.Types.Mixed
}, {collection : 'properties'});

module.exports = mongoose.model('Properties', propertiesSchema);