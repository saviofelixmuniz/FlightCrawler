/**
 * @author Sávio Muniz
 */

var formatters = {
    gol : require('./response-formatters/gol.formatter'),
    latam : require('./response-formatters/latam.formatter')
};

const { URL, URLSearchParams } = require('url');

exports.urlFormat = urlFormat;
exports.parseLatamResponse = parseLatamResponse;
exports.responseFormat = responseFormat;

function urlFormat(root, path, params) {
    const myURL = new URL(path, root);
    Object.keys(params).forEach(function (param) {
        myURL.searchParams.append(param, params[param]);
    });
    return myURL.href;
}

function parseLatamResponse (response) {
    var json = response.split('<script> var clientSideData = ')[1].split('; </script> <script')[0];
    json = json.replace(/="/g,"='");
    json = json.split('; var clientMessages = ')[0];
    return JSON.parse(json);
}

function responseFormat(jsonRedeemResponse, jsonCashResponse, searchParams, company) {
    return formatters[company](jsonRedeemResponse, jsonCashResponse, searchParams);
}