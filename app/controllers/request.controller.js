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

function getFlight(req, res, next) {
    var flightId = req.params.id;
    Requests.$where(`for (var trecho in this.response['Trechos']) {for (var flight of this.response['Trechos'][trecho].Voos) {if (flight._id == '${flightId}') {return true;}}}return false;`).exec(function (oi, tchau) {
        console.log(tchau);
    })
}

function matchFlight(){
    console.log(this);
    for (var trecho in this.response['Trechos']) {
        for (var flight of this.response['Trechos'][trecho].Voos) {
            if (flight.id == "5b9327399649f2139066335e") {
                return true;
            }
        }
    }
    return false;
}

module.exports = {
    getRequest: getRequest,
    getRequestParams: getParams,
    getFlight: getFlight
};