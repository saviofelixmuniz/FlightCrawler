const MESSAGES = require('./messages');
const exception = require('../services/exception');

exports.solveFlightInfoErrors = function solveFlightInfoErrors(company, err, res, startTime, params) {
    if (err.err) {
        if (err.code === 407 || err.code === 504 || err.code === 502) {
            exception.handle(res, company, (new Date()).getTime() - startTime, params, err.stack, 504, MESSAGES.PROXY_ERROR, new Date());
        }
        else {
            exception.handle(res, company, (new Date()).getTime() - startTime, params, err.stack, err.code, err.message, new Date());
        }
    } else {
        exception.handle(res, company, (new Date()).getTime() - startTime, params, err.stack, 500, MESSAGES.CRITICAL, new Date());
    }
};

exports.getHttpStatusCodeFromMSG = function getHttpStatusCodeFromMSG(msg) {
    const status_code = msg.match(/(\s*(?:statuscode|status|code|httpstatus)\s*=\s*\d\d\d)|\d\d\d/) || 500;
    return status_code.toString().match(/\d+/).toString();
};