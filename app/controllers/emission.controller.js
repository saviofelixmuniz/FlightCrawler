/**
 * @author Anderson Menezes
 */
module.exports = {
    getEmissionReport: getEmissionReport,
    cancelEmission: cancelEmission,
    wasCanceled: wasCanceled
};

const db = require('../util/services/db-helper');

var emissionsToBeCanceled = [];

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

async function cancelEmission(req, res, next) {
    if (!req.body.id) {
        res.status(400).json();
        return;
    }
    emissionsToBeCanceled.push(req.body.id);
    res.json();
}

async function wasCanceled(emission, step, result) {
    debugger;
    if (emissionsToBeCanceled.indexOf(emission._id.toString()) >= 0) {
        emissionsToBeCanceled.splice(emissionsToBeCanceled.indexOf(emission._id.toString()), 1);
        await db.updateEmissionReport(emission.company, emission._id, step, 'CANCELED', null, true, result);
        return true;
    }

    return false;
}