/**
 * @author Sávio Muniz
 */

const ENVIRONMENT = process.env.environment || 'dev';
const PROXY_ON = process.env.PROXY_ON;
const MAX_TRIES = 3;
const Properties = require('../../db/models/properties');
const Proxy = require('./proxy-providers/proxy');
const RandomUA = require('random-useragent');
const sessions = {};

exports.require = async function (obj) {
    if (!obj.session) {
        obj.session = generateSession(obj.company, obj.request.jar);
    }

    if (!obj.request.headers) {
        obj.request.headers = {};
    }

    if (!obj.request.headers["user-agent"] && !obj.request.headers["User-Agent"])
        obj.request.headers["user-agent"] = sessions[obj.session].agent;

    if (sessions[obj.session].cookies && !obj.request.jar) {
        obj.request.jar = sessions[obj.session].cookies;
    }

    if (PROXY_ON === 'true') {
        obj.request.proxy = await getProxyString(obj.session)
    }

    if (!obj.request.method) {
        if (obj.request.form || obj.request.json) {
            obj.request.method = 'POST'
        }
        else
            obj.request.method = 'GET'
    }

    obj.request.simple = false;

    let success = false;
    let data = null;
    let tries = 0;
    while (!success) {
        try {
            data = await require('request-promise')(obj.request);
            success = true;
        } catch (e) {
            console.log("...REQUEST ERROR, TRYING OVER");
            tries++;
            if (tries === MAX_TRIES) {
                throw e;
            }
        }
    }


    return data;
};

async function getProxyString(session) {
    var company = sessions[session].company;
    var proxyProvider = (await Properties.findOne({key: "proxy_provider"})).value[company];
    var proxyStr = null;

    if (sessions[session].proxy_ip)
        proxyStr = sessions[session].proxy_ip;
    else {
        proxyStr = await Proxy(proxyProvider, company, session);
        sessions[session].proxy_ip = proxyStr
    }

    console.log("----");
    console.log(`Session: ${session}    Company: ${company}    Proxy: ${proxyStr}`);
    console.log("----");

    return proxyStr
}

exports.createSession = generateSession;
exports.killSession = function (sessionId) {
    delete sessions[sessionId];
};

exports.getSessionJar = function (sessionId) {
    return sessions[sessionId].cookies;
};

exports.getSessionAgent = function (sessionId) {
    return sessions[sessionId].agent;
};

function generateSession(company, noJar) {
    let unique = false;
    let sessionId = null;
    while (!unique) {
        sessionId = ENVIRONMENT + company + Math.floor((Math.random() * 10000) + 1);
        if (!sessions[sessionId])
            unique = true;
    }

    sessions[sessionId] = {agent: "Mozilla\\/5.0 (Android Mobile rv:25.0) Gecko\\/25.0 Firefox\\/25.0", company: company};

    if (!noJar)
        sessions[sessionId].cookies = require('request-promise').jar();

    return sessionId;
}