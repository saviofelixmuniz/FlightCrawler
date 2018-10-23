var Requests = require('../db/models/requests');
const CONSTANTS = require('../util/helpers/constants');

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

    Requests.$where(CONSTANTS.FIND_FLIGHT_QUERY(flightId)).exec(function (err, result) {
        if (err) {
            res.status(500).json({message: "Failed to retrieve flight"})
        }

        var request = result[0];
        var flight = findFlight(request, flightId);
        flight.request_id = request._id;
        res.status(200).json(flight);
    });
}

function findFlight(request, flightId) {
    for (var trecho in request.response['Trechos']) {
        for (var flight of request.response['Trechos'][trecho]['Voos']) {
            if (flight._id.toString() === flightId) {
                return flight;
            }
        }
    }
}

module.exports = {
    getRequest: getRequest,
    getRequestParams: getParams,
    getFlight: getFlight
};