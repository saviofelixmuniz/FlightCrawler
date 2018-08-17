var Requests = require('../db/models/requests');

function getParams(req, res, next) {
    var id = req.params.id;
    Requests.findOne({_id: id}).then(function (obj) {
        if (!obj){
            res.status(404).json({err: 'id is invalid'});
            return;
        }

        res.status(200).json(obj.params);
    }).catch(function (err) {
        res.status(400).json(err);
    });
}

function getRequest(req, res, next) {
    var id = req.params.id;
    Requests.findOne({_id: id}).then(function (obj)  {
        if (!obj) {
            res.status(404).json({err: 'id is invalid'});
            return;
        }
        res.status(200).json(obj);
    }).catch(function (err) {
        res.status(400).json(err);
    });
}

module.exports = {
    getRequest: getRequest,
    getRequestParams: getParams
};