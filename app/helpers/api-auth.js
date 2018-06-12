/**
 * @author Sávio Muniz
 */
const Properties = require('../db/models/properties');
const exception = require('../helpers/exception');
const request = require('request-promise');

const AUTHORIZED_DNS_COLLECTION = 'authorized_dns';
const AUTHORIZED_IPS_COLLECTION = 'authorized_ips';

exports.checkReqAuth = async function checkIp (req, res, next) {
    var ipAddress = req.clientIp;

    var company = req.baseUrl.split('/api/')[1];

    if (isLocalHost(ipAddress)) {
        next();
    }

    else if (req.headers['authorization']) {
        if (checkApiKey(req)) {
            next();
        }
        else {
            exception.handle(res, company, 0, {IP: ipAddress}, 'Invalid key.', 401, 'Invalid key.', new Date());
        }
    }

    else if (await checkAuthorizedIPs(ipAddress) || await checkAuthorizedDNS(ipAddress)) {
        next();
    }

    else {
        exception.handle(res, company, 0, {IP: ipAddress}, 'Your IP address is not authorized.', 401, 'Your IP address is not authorized.', new Date());;
    }
};

function checkApiKey(req) {
    return req.headers['authorization'] === process.env.apiKey;
}

function isLocalHost(ipAddress) {
    return ipAddress === '::1' || ipAddress === '127.0.0.1';
}

async function checkAuthorizedIPs(ipAddress) {
    var authorizedIPs = (await Properties.findOne({key: AUTHORIZED_IPS_COLLECTION}, '', {lean: true})).value;

    return authorizedIPs.indexOf(ipAddress) !== -1;
}

async function checkAuthorizedDNS(ipAddress) {
    var authorizedDNSs = (await Properties.findOne({key: AUTHORIZED_DNS_COLLECTION}, '', {lean: true})).value;

    for (var dns of authorizedDNSs) {
        var ipDNS = await lookupDNS(dns);
        if (ipDNS === ipAddress) {
            return true;
        }
    }

    return false;
}

async function lookupDNS(url) {
    var result = JSON.parse(await request.get({url: 'https://dns.google.com/resolve?name=' + url}));
    return result['Answer'][0].data;
}