/**
 * @author Sávio Muniz
 */

const ENVIRONMENT = process.env.environment;
const PROXY_ON = process.env.PROXY_ON;

exports.setupAndRotateRequestLib = function (requestLib, company) {
    //if in local environment, proxy is not used
    var token = getSessionToken(company);
    console.log(token);
    return ENVIRONMENT && PROXY_ON === 'true'? require(requestLib).defaults({proxy : `http://lum-customer-incodde-zone-residential-session-${token}:dd64777275cb@zproxy.lum-superproxy.io:22225`, simple: false}) : require(requestLib).defaults({simple: false});
};

function getSessionToken(company) {
    return ENVIRONMENT + company + Math.floor((Math.random() * 10000) + 1);
}