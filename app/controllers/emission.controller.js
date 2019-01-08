/**
 * @author Anderson Menezes
 */
module.exports = {
    getEmissionReport: getEmissionReport
};

const db = require('../util/services/db-helper');

async function getEmissionReport(req, res, next) {
    db.getEmissionReport(req.params.id).then(function (emissionReport) {
        if (emissionReport) res.json(emissionReport);
        else {
            res.status(404);
            res.json();
        }
    }).catch(function (err) {
        res.status(500);
        res.json();
    });
}