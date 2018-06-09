/**
 * @author Sávio Muniz
 */
const DNS = require('dns');
const util = require('util');
const Properties = require('../db/models/properties');

const options = {
    family: 4,
    hints: DNS.ADDRCONFIG | DNS.V4MAPPED
};

const AUTHORIZED_DNS_COLLECTION = 'authorized_dns';
const AUTHORIZED_IPS_COLLECTION = 'authorized_ips';

exports.checkReqAuth = async function checkIp (req) {
    console.log('CHECKING AUTHORIZATION');

    var ipAddress = req.clientIp;
    console.log(`IP ADDRESS IS: ${ipAddress}`);

    if (isLocalHost(ipAddress))
        return {authorized: true};

    else if (req.headers['authorization']) {
        if (checkApiKey(req)) {
            return {authorized: true};
        }
        else
            return {authorized: false, message: 'Invalid key.'}
    }

    else if (await checkAuthorizedIPs(ipAddress) || await checkAuthorizedDNS(ipAddress)) {
        return {authorized: true};
    }

    return {authorized: false, message: 'Your IP address is not authorized.'};
};

function checkApiKey(req) {
    return req.headers['authorization'] === process.env.apiKey;
}

function isLocalHost(ipAddress) {
    if (ipAddress === '::1' || ipAddress === '127.0.0.1') {
        return true;
    }
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
    var promisified = util.promisify(DNS.lookup);
    var res = await promisified(url, options);
    return res.address;
}