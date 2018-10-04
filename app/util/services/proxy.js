/**
 * @author Sávio Muniz
 */

const ENVIRONMENT = process.env.environment || 'dev';
const PROXY_ON = process.env.PROXY_ON;
const MAX_TRIES = 3;
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

    if (sessions[obj.session].cookies) {
        obj.request.jar = sessions[obj.session].cookies;
    }

    if (PROXY_ON === 'true') {
        obj.request.proxy = getProxyString(obj.session)
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

function getProxyString(session) {
    return `http://lum-customer-incodde-zone-enhancement_test-country-br-session-${session}:pfts1zhv36n1@zproxy.lum-superproxy.io:22225`;
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

    sessions[sessionId] = {agent: RandomUA.getRandom()};

    if (!noJar)
        sessions[sessionId].cookies = require('request-promise').jar();

    return sessionId;
}