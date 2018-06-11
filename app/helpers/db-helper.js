/**
 * @author Sávio Muniz
 */

const Request = require('../db/models/requests');

exports.saveRequest = function (company, elapsedTime, params, log, status) {
    const newRequest = {
        company : company,
        time : elapsedTime,
        http_status: status,
        log : log,
        params : params,
        date : new Date()
    };

    Request
        .create(newRequest)
        .then(function (request) {
            console.log('Saved request!')
        })
        .catch(function (err) {
            console.log(err);
            console.error('Failed to save request!');
        });
};