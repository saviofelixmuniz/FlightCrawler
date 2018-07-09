/**
 * @author Sávio Muniz
 */

const ENVIRONMENT = process.env.environment;
const PROXY_ON = process.env.PROXY_ON;

exports.setupAndRotateRequestLib = function (requestLib, company) {
    //if in local environment, proxy is not used
    return ENVIRONMENT && PROXY_ON === 'true'? require(requestLib).defaults({proxy : `http://lum-customer-incodde-zone-residential-session-${ENVIRONMENT + company}:dd64777275cb@zproxy.lum-superproxy.io:22225`, simple: false}) : require(requestLib).defaults({simple: false});
};
