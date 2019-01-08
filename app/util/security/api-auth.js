/**
 * @author Sávio Muniz
 */
const Properties = require('../../db/models/properties');
const exception = require('../services/exception');
const request = require('request-promise');
const COMPANIES = ['azul', 'avianca', 'latam', 'gol'];

const AUTHORIZED_DNS_COLLECTION = 'authorized_dns';
const AUTHORIZED_IPS_COLLECTION = 'authorized_ips';
const AUTHORIZED_KEYS_COLLECTION = 'authorized_keys';

exports.checkReqAuth = async function checkIp (req, res, next) {
    var ipAddress = req.clientIp;

    var route = req.baseUrl.split('/api/')[1];

    if (isLocalHost(ipAddress)) {
        next();
    }

    else if (req.headers['authorization']) {
        let client = await checkApiKey(req.headers['authorization']);

        if (client || client === "") {
            req.clientName = client;
            next();
        }

        else {
            if (COMPANIES.indexOf(route) === -1 ) {
                res.status(401).json({err: 'Invalid API key.'});
                return;
            }
            exception.handle(res, route, 0, {IP: ipAddress, key: req.headers['authorization']}, 'Invalid key.', 401, 'Invalid key.', new Date());
        }
    }

    else if (await checkAuthorizedIPs(ipAddress) || await checkAuthorizedDNS(ipAddress)) {
        next();
    }

    else {
        exception.handle(res, route, 0, {IP: ipAddress}, 'Your IP address is not authorized.', 401, 'Your IP address is not authorized.', new Date());;
    }
};

async function checkApiKey(key) {
    var authorizedKeys = (await Properties.findOne({key: AUTHORIZED_KEYS_COLLECTION}, '', {lean: true})).value;
    return authorizedKeys[key];
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