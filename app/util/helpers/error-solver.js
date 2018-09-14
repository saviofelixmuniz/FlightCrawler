const MESSAGES = require('./messages');
const exception = require('../services/exception');

exports.solveFlightInfoErrors = function solveFlightInfoErrors(company, err, res, startTime, params) {
    if (err.err) {
        if (err.code === 407) {
            exception.handle(res, company, (new Date()).getTime() - startTime, params, err.stack, 504, MESSAGES.PROXY_ERROR, new Date());
        } else {
            exception.handle(res, company, (new Date()).getTime() - startTime, params, err.stack, err.code, err.message, new Date());
        }
    } else {
        exception.handle(res, company, (new Date()).getTime() - startTime, params, err.stack, 500, MESSAGES.CRITICAL, new Date());
    }
};

exports.getHttpStatusCodeFromMSG = function getHttpStatusCodeFromMSG(msg) {
    return msg.match(/\s*(?:statuscode|status|code|httpstatus)\s*=\s*\d\d\d/i).toString().match(/\d+/).toString();
};