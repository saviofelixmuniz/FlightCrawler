/**
 * @author Sávio Muniz
 */

const request = require('request');

module.exports = function (req, res) {
    let url = 'https://www.voelegal.com.br/api/crawler/find';
    let postBody = req.body;
    console.log(req.body);

    request.post({url : url, body: postBody, json:true}, function (err, response, body) {
        res.json(body);
    });
};