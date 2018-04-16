/**
 * @author Sávio Muniz
 */
const db = require('../helpers/db-helper');

exports.handle = function throwRegularError(resObj, company, interval, params, stackTrace, statusCode, message, date) {
    resObj.status(statusCode);
    resObj.json({error : message});
    db.saveRequest(company, interval, params, stackTrace, statusCode, date);
};
