/**
 * @author Sávio Muniz
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = Schema({
    email: {
        required: true,
        type: String,
        unique: true
    },
    password: {
        required: true,
        type: String
    },
    name: {
        required: true,
        type: String
    },
    role: {
        type: String,
        enum: ['regular', 'admin'],
        default: 'regular'
    }
}, {collection : 'users'});


userSchema.statics.isEmailTaken = function(email) {
    if (email)
        return this.findOne({email: email})
                    .then(function (user) {
                        return user ? true : false;
                });
};

module.exports = mongoose.model('User', userSchema);
