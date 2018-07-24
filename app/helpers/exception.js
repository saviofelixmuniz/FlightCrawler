/**
 * @author Sávio Muniz
 */
const db = require('../helpers/db-helper');

exports.handle = async function throwRegularError(resObj, company, interval, params, stackTrace, statusCode, message, date) {
    var request = await db.saveRequest(company, interval, params, stackTrace, statusCode, null);
    resObj.status(statusCode);
    resObj.json({error : message, id: request._id});
};
