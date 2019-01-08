/**
 * @author Sávio Muniz
 */

const Request = require('../../db/models/requests');
const RequestResources = require('../../db/models/requestResources');
const EmissionReport = require('../../db/models/emissionReports');
const Airport = require('../../db/models/airports');
const Properties = require('../../db/models/properties');
const Time = require('../helpers/time-utils');
const TOTAL_EMISSION_REQUESTS_AZUL = 11;
const TOTAL_EMISSION_REQUESTS_GOL = 11;

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
    query['response'] = {'$ne': null};
    return Request.findOne(query, '', {lean: true}).sort({date: -1}).then(function (request) {
        if (request) request.response.id = request._id;
        return request? request.response : undefined;
    });
};

exports.getRequestResources = function (requestId) {
    return RequestResources.findOne({requestId: requestId}, '', {lean: true}).then(function (requestResources) {
        return requestResources;
    }).catch(function (err) {
        return null;
    });
};

exports.getRequest = function (requestId) {
    return Request.findOne({_id: requestId}, '', {lean: true}).then(function (request) {
        return request;
    }).catch(function (err) {
        return null;
    });
};

exports.getEmissionReport = function (emissionId) {
    return EmissionReport.findOne({_id: emissionId}, '', {lean: true}).then(function (emissionReport) {
        return emissionReport;
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
        response: response
    };

    return Request
        .create(newRequest)
        .then(function (request) {
            console.log('Saved request!');
            return request;
        })
        .catch(function (err) {
            console.log(err);
            console.error('Failed to save request!');
            return undefined;
        });
};

exports.createEmissionReport = function (requestId, company, data) {
    const newReport = {
        request_id: requestId,
        company : company,
        log : null,
        response: null,
        date : new Date(),
        end: null,
        progress: {
            done: 0,
            total: getTotalEmissionReports(company)
        },
        results: null,
        data: {
            credentials: { login: data.credentials.login },
            payment: {
                card_brand_code: data.payment.card_brand_code,
                card_number: data.payment.card_number,
                card_name: data.payment.card_name,
                card_exp_date: data.payment.card_exp_date,
                cpf: data.payment.cpf
            },
            going_flight_id: data.going_flight_id,
            returning_flight_id: data.returning_flight_id,
            passengers: data.passengers
        }
    };

    return EmissionReport
        .create(newReport)
        .then(function (report) {
            console.log('Created emission report!');
            return report.toObject();
        })
        .catch(function (err) {
            console.log(err);
            console.error('Failed to create emission report!');
            return undefined;
        });
};

exports.updateEmissionReport = function (company, id, reqNumber, log, response, end, results) {
    if (log) console.log('Error on emission: ' + log);

    const report = {
        log: log,
        response: response,
        end: end ? new Date() : null,
        progress: {
            done: reqNumber,
            total: getTotalEmissionReports(company),
            label: getStepName(company, reqNumber)
        },
        results: results ? results : null
    };

    return EmissionReport
        .update({ _id: id }, report, { upsert: true, lean: true })
        .then(function (report) {
            console.log('Updated emission report!');
            return report;
        })
        .catch(function (err) {
            console.log(err);
            console.error('Failed to update emission report!');
            return undefined;
        });
};

function getStepName(company, stepNumber) {
    if (company.toLowerCase() === 'azul') {
        switch (stepNumber) {
            case 1:
            case 2:
                return 'login';
            case 4:
                return 'pesquisa e verificação de preço';
            case 8:
            case 9:
                return 'reserva';
            case 10:
                return 'pagamento';
            case 11:
                return 'localizador';
            default:
                return '';
        }
    } else if (company.toLowerCase() === 'gol') {
        switch (stepNumber) {
            case 1:
            case 2:
                return 'login';
            case 4:
                return 'pesquisa e verificação de preço';
            case 5:
                return 'taxas';
            case 6:
                return 'checkout';
            case 7:
                return 'passageiros';
            case 8:
                return 'reserva';
            case 9:
            case 10:
                return 'pagamento';
            case 11:
                return 'localizador';
            default:
                return '';
        }
    }

    return '';
}

function getTotalEmissionReports(company) {
    if (company.toLowerCase() === 'gol') {
        return TOTAL_EMISSION_REQUESTS_GOL;
    } else if (company.toLowerCase() === 'azul') {
        return TOTAL_EMISSION_REQUESTS_AZUL;
    }

    return 0;
}

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