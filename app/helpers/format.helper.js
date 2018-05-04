/**
 * @author Sávio Muniz
 */

var formatters = {
    gol : require('./response-formatters/gol.formatter'),
    latam : require('./response-formatters/latam.formatter'),
    avianca : require('./response-formatters/avianca.formatter'),
    azul : require('./response-formatters/azul.formatter')
};

const { URL, URLSearchParams } = require('url');

exports.urlFormat = urlFormat;
exports.parseLatamResponse = parseLatamResponse;
exports.responseFormat = responseFormat;
exports.parseAviancaResponse = parseAviancaResponse;

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

function parseAviancaResponse(response) {
    return JSON.parse(response.body.split('config : ')[1].split('});')[0].split(', pageEngine')[0]);
}

function responseFormat(jsonRedeemResponse, jsonCashResponse, searchParams, company, cookieJar) {
    return formatters[company](jsonRedeemResponse, jsonCashResponse, searchParams, cookieJar);
}