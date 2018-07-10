/**
 * @author Sávio Muniz
 */

const Request = require('../db/models/requests');
const Airport = require('../db/models/airports');
const Time = require('../helpers/time-utils');

const ENVIRONMENT = process.env.environment;

exports.getCachedResponse = function (params, date, company) {
    var timeAgo = new Date(date - Time.transformTimeUnit('minute', 'mili', ENVIRONMENT === 'production' ? 10: 30));

    var query = {};
    for (var param of Object.keys(params)) {
        if (['forceCongener', 'infants', 'IP'].indexOf(param) !== -1)
            continue;
        query["params." + param] = params[param];
    }
    query['company'] = company;
    query['http_status'] = 200;
    query['date'] = {'$gte': timeAgo};
    query['response'] = {'$ne': null};
    return Request.findOne(query, '', {lean: true}).sort({date: -1}).then(function (request) {
        return request[0] ? request[0].response : undefined;
    });
};

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