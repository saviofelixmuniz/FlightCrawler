/**
 * @author Sávio Muniz
 */
var lastProxyUsed = null;

var PROXY_URLS = ['http://192.151.156.42:19011',
    'http://104.255.65.67:19011',
    'http://69.197.182.218:19016',
    'http://173.242.127.163:19013',
    'http://69.197.182.218:19010'];

function getProxyUrl (rotate) {
    if (rotate || !lastProxyUsed)
        lastProxyUsed = PROXY_URLS[Math.floor(Math.random() * 5)];
    return lastProxyUsed;
}

exports.setupAndRotateRequestLib = function (requestLib, rotate) {
    //if in local environment, proxy is not used
    return process.env.environment !== 'production' ? require(requestLib) : require(requestLib).defaults({proxy : getProxyUrl(rotate), simple: false});
};
