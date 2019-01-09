const request = require('request-promise');
const Properties = require('../../../db/models/properties');

module.exports = getProxyStr;

async function getProxyStr (company) {
    var proxySettings = (await Properties.findOne({key: "proxy-rotator_proxy_settings"})).value[company];

    var result = await requestProxy(proxySettings);

    while (!result.proxy) {
        result = await requestProxy(proxySettings)
    }

    return "http://" + result.proxy;
}

async function requestProxy(proxySettings) {
    return JSON.parse(await request.get({
        url: `http://falcon.proxyrotator.com:51337/?apiKey=rWMNkf5n7UCjhsH9yow468vRtLYQZSdg&country=${proxySettings.country.toUpperCase()}&connectionType=${proxySettings.type}`,
        simple: false
    }));
}