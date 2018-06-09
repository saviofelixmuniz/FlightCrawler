/**
 * @author Sávio Muniz
 */
const DNS = require('dns');
const util = require('util');

const options = {
    family: 4,
    hints: DNS.ADDRCONFIG | DNS.V4MAPPED
};

const AUTHORIZED_DNS = ['ec2-34-204-96-145.compute-1.amazonaws.com'];

const AUTHORIZED_IPS = ['127.0.0.1', '::1'];

exports.checkReqAuth = async function checkIp (req) {
    console.log('CHECKING AUTHORIZATION');

    var ipAddress = req.clientIp;
    console.log(`IP ADDRESS IS: ${ipAddress}`);

    if (req.headers['authorization']) {
        if (req.headers['authorization'] === process.env.apiKey){
            console.log('...authorized on api key');
            return {authorized: true};
        }
        else
            return {authorized: false, message: 'Invalid key.'}
    }

    else if (AUTHORIZED_IPS.indexOf(ipAddress) !== -1) {
        console.log('...authorized on ip address');
        return {authorized: true};
    }

    else {
        for (var dns of AUTHORIZED_DNS) {
            var ipDNS = await lookupDNS(dns);
            if (ipDNS === ipAddress) {
                console.log('...authorized on dns');
                return true;
            }
        }
    }

    return {authorized: false, message: 'Your IP address is not authorized.'};
};

async function lookupDNS(url) {
    var promisified = util.promisify(DNS.lookup);
    var res = await promisified(url, options);
    return res.address;
}