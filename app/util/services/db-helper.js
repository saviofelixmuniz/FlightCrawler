/**
 * @author Sávio Muniz
 */

const Request = require('../../db/models/requests');
const Airport = require('../../db/models/airports');
const Properties = require('../../db/models/properties');
const Time = require('../helpers/time-utils');

const ENVIRONMENT = process.env.environment;

exports.checkUnicorn = async function (company) {
    let unicornCompanies = (await Properties.findOne({key: 'unicorn'}, '', {lean: true})).value;
    return unicornCompanies.indexOf(company) !== -1;
};

exports.getCachedResponse = function (params, date, company) {
    let timeAgo = new Date(date - Time.transformTimeUnit('minute', 'mili', ENVIRONMENT === 'production' ? 10: 30));

    let query = {};
    for (let param of Object.keys(params)) {
        if (['forceCongener', 'infants', 'IP'].indexOf(param) !== -1)
            continue;
        query["params." + param] = params[param];
    }
    query['company'] = company;
    query['http_status'] = 200;
    query['date'] = {'$gte': timeAgo};
    query['response'] = {'$ne': null};
    return Request.findOne(query, '', {lean: true}).sort({date: -1}).then(function (request) {
        return request? request.response : undefined;
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