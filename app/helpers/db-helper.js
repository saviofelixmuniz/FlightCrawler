/**
 * @author Sávio Muniz
 */

const Request = require('../db/models/requests');
const Airport = require('../db/models/airports');

exports.saveRequest = function (company, elapsedTime, params, log, status, response) {
    const newRequest = {
        company : company,
        time : elapsedTime,
        http_status: status,
        log : log,
        params : params,
        date : new Date(),
        response: response
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

exports.saveAirport = function (code, tax, company) {
    const newAirport = {
        code : code,
        tax : tax,
        date : new Date(),
        $addToSet: { companies: company }
    };

    Airport
        .update({ code: code }, newAirport, { upsert: true })
        .then(function (airport) {
            console.log(`Saved airport (${code})!`)
        })
        .catch(function (err) {
            console.log(err);
            console.error('Failed to save airport!');
        });
};