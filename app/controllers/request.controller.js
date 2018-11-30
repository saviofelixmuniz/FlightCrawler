const Requests = require('../db/models/requests');
const Response = require('../db/models/response');
const FlightRequest = require('../db/models/flightRequest');
const db = require('../util/services/db-helper');
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

async function getRequest(req, res, next) {
    try {
        var id = req.params.id;
        var request = await db.getRequest(id);

        if (!request) res.status(404).json({err: 'id is invalid'});
        res.status(200).json(request);
    }
    catch(err) {
        res.status(400).json(err)
    };
}

async function getFlight(req, res, next) {
    var flightId = req.params.id;

    var flightRequest = await FlightRequest.findOne({flight_id: flightId}).then(function (flight) {
        return flight;
    });

    var response = await Response.findOne({_id: flightRequest.response_id}).then(function (res) {
        return res;
    });

    var flight = findFlight(response, flightId);
    flight.response_id = response._id;
    res.status(200).json(flight);
}

function findFlight(response, flightId) {
    for(trecho of Object.values(response.trechos)){
        for(flight of trecho["Voos"]){
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