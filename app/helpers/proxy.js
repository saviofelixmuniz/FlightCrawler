/**
 * @author Sávio Muniz
 */
var lastProxyUsed = null;
const ENVIRONMENT = process.env.environment;

var PROXY_TEST_URLS = ['http://173.208.211.82:19002'];

var PROXY_PROD_URLS = ['http://192.151.156.42:19011',
    'http://104.255.65.67:19011',
    'http://69.197.182.218:19016',
    'http://173.242.127.163:19013',
    'http://69.197.182.218:19010'];

function getProxyUrl (rotate) {
    if (rotate || !lastProxyUsed)
        lastProxyUsed = ENVIRONMENT === 'test' ? PROXY_TEST_URLS[Math.floor(Math.random() * PROXY_TEST_URLS.length)] :
                                                 PROXY_PROD_URLS[Math.floor(Math.random() * PROXY_PROD_URLS.length)];
    return lastProxyUsed;
}

exports.setupAndRotateRequestLib = function (requestLib, rotate) {
    //if in local environment, proxy is not used
    return ENVIRONMENT ? require(requestLib).defaults({proxy : getProxyUrl(rotate), simple: false}) : require(requestLib);
};
