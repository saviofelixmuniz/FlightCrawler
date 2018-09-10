const db = require('./db-helper');
const Unicorn = require('./unicorn/unicorn');
const ENVIRONMENT = process.env.environment;

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

    if (await db.checkUnicorn('gol')) {
        console.log(company.toUpperCase() + ': ...started UNICORN flow');
        var formattedData = await Unicorn(params, company);
        res.json({results: formattedData});
        db.saveRequest(company, (new Date()).getTime() - startTime, params, null, 200, formattedData);
        return true;
    }
};
