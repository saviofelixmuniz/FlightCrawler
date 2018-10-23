const db = require('./db-helper');
const Unicorn = require('./unicorn/unicorn');
const exception = require('./exception');
const ENVIRONMENT = process.env.environment;
const MESSAGES = require('../helpers/messages');

module.exports = async function start(params, startTime, company, res) {
    if (ENVIRONMENT && ENVIRONMENT !== 'dev') {
        var cached = await db.getCachedResponse(params, new Date(), company);

        if (cached) {
            var request = await db.saveRequest(company, (new Date()).getTime() - startTime, params, null, 200, null);
            var cachedId = cached.id;
            delete cached.id;
            res.status(200).json({results: cached, cached: cachedId, id: request._id});
            return true;
        }
    }

    if (await db.checkUnicorn(company)) {
        console.log(company.toUpperCase() + ': ...started UNICORN flow');
        try {
            var formattedData = await Unicorn(params, company);
            res.json({results: formattedData});
            db.saveRequest(company, (new Date()).getTime() - startTime, params, null, 200, formattedData);
            return true;
        } catch (err) {
            exception.handle(res, company, (new Date()).getTime() - startTime, params, err.err, err.code, err.message, new Date());
        }
    }

    if (params.executive && params.originCountry === 'BR' && params.destinationCountry === 'BR') {
        exception.handle(res, company, (new Date()).getTime() - startTime, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
        return true;
    }
};
