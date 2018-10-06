/**
 * @author Sávio Muniz
 */

const Request = require('../../db/models/requests');
const Response = require('../../db/models/response');
const RequestResources = require('../../db/models/requestResources');
const Airport = require('../../db/models/airports');
const Properties = require('../../db/models/properties');
const Time = require('../helpers/time-utils');

const ENVIRONMENT = process.env.environment;

exports.checkUnicorn = async function (company) {
    try {
        var unicornCompanies = (await Properties.findOne({key: 'unicorn'}, '', {lean: true})).value;
        return unicornCompanies.indexOf(company) !== -1;
    } catch (e) {
        return false;
    }
};

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
    //query['response'] = {'$ne': null};
    return Request.findOne(query, '', {lean: true}).sort({date: -1}).then(function (request) {
        return (!request) ? undefined :
            Response.findOne({'id_request': request._id}).then(function(response){
                return response
            });
    });
};

exports.getRequestResources = function (requestId) {
    return RequestResources.findOne({requestId: requestId}, '', {lean: true}).then(function (requestResources) {
        return requestResources;
    }).catch(function (err) {
        return null;
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
        response: (response) ? true : false
    };

    var newResponse = {};

    if(response){
        newResponse = {
            results: response.results,
            busca: response.Busca,
            trechos: response.Trechos
        }
    }

    return Request
        .create(newRequest)
        .then(function (request) {
            if(response){
                //newResponse.id_request = request._doc._id;
                Response.create(newResponse);
            }
            console.log('Saved request!');
            return request;
        })
        .catch(function (err) {
            console.log(err);
            console.error('Failed to save request!');
            return undefined;
        });
};

exports.saveRequestResources = function (requestId, headers, cookieJar, resources) {
    const newRequestResources = {
        requestId: requestId,
        cookieJar: cookieJar,
        headers: headers,
        resources: resources
    };

    return RequestResources
        .create(newRequestResources)
        .then(function (requestResources) {
            console.log('Saved request resources!');
            return requestResources;
        })
        .catch(function (err) {
            console.log(err);
            console.error('Failed to save request resources!');
            return undefined;
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