const request = require('request-promise');

module.exports = getProxyStr;

async function getProxyStr () {
    var ipType = "Mobile";

    var result = JSON.parse(await request.get({
        url: `http://falcon.proxyrotator.com:51337/?apiKey=s4ykFjXMf5Suw8NoGBgaHJtpLecYdxAm&country=BR&connectionType=${ipType}`,
        simple: false
    }));

    while (!result.proxy) {
        var type = ipType === "Mobile" ? "Residential" : "Mobile";
        result = JSON.parse(await request.get({
            url: `http://falcon.proxyrotator.com:51337/?apiKey=s4ykFjXMf5Suw8NoGBgaHJtpLecYdxAm&country=BR&connectionType=${type}`,
            simple: false
        }));
    }

    return result.proxy;
}