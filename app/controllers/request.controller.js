var Requests = require('../db/models/requests');
var Response = require('../db/models/response');

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
        var response = null; // It's really necessary ? Or can be false.
        var request = await Requests.findOne({_id: id}).then(function (obj)  {
            if (!obj) {
                res.status(404).json({err: 'id is invalid'});
                return;
            }
            return obj;
        });

        if(request.response){
            response = await Response.findOne({'id_request': id}).then(function (resp) {
               return {'results': resp.results, 'Trechos': resp.trechos, 'Busca': resp.busca};
           });
        }

        request.response = response;
        res.status(200).json(request);
    }
    catch(err) {
        res.status(400).json(err)
    };
}

module.exports = {
    getRequest: getRequest,
    getRequestParams: getParams
};