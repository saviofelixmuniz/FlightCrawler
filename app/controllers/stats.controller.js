/**
 * @author Sávio Muniz
 */

const Requests = require('../db/models/requests');

exports.getResponseTime = function (req, res) {
    try {
        buildRequestQuery(req).then(function (requests) {
            var sumCompanies = {};
            requests.forEach(function (request) {
                if (!sumCompanies[request.company]) {
                    sumCompanies[request.company] = {sum : 0, count: 0};
                }

                sumCompanies[request.company].sum += request.time;
                sumCompanies[request.company].count += 1;
            });
            
            var avgResult = {};
            
            Object.keys(sumCompanies).forEach(function (company) {
                avgResult[company] = sumCompanies[company].sum / sumCompanies[company].count;
            });

            res.status(200);
            res.json(avgResult);
        })
    } catch (e) {
        throw e;
    }
};

exports.getRequestSuccessRateAPI = function (req, res) {
    getRequestSuccessRate(req.start, req.end, req.company).then(function (companies) {
        res.status(200);
        res.json(companies);
    });
};

exports.getRequestLogs = function (req, res) {
    buildRequestQuery(req, true).then(function (requests) {
        var companyLogs = {};
        requests.forEach(function (request) {
            if (!companyLogs[request.company]) {
                companyLogs[request.company] = [];
            }

            companyLogs[request.company].push({
                date : request.date,
                params : request.params,
                message : request.log,
                status : request.http_status
            });
        });

        res.status(200);
        res.json(companyLogs);
    });
};

exports.getDetailedRequestStats = async function (req, res) {
    var params = {
        start: Number(req.query.start),
        end: Number(req.query.end),
        company: req.query.company,
        granularity: req.query.granularity
    };

    var startDate = new Date(params.start);
    var endDate = new Date(params.end);

    var datesArray = [];


    var earliestDate = (await Requests.find({},{date : 1}).sort({date: 1}).limit(1))[0].date;
    var latestDate = (await Requests.find({},{date : 1}).sort({date: -1}).limit(1))[0].date;

    startDate = startDate > earliestDate ? startDate : earliestDate;
    endDate = endDate < latestDate ? endDate : latestDate;

    var itDate = startDate;

    while (itDate < endDate) {
        datesArray.push(new Date(itDate));
        itDate.setMinutes(itDate.getMinutes() + Number(params.granularity));
    }

    var outputData = [];
    var promises = [];

    datesArray.forEach(async function (date, index) {
        var requestPromise = (Requests.find({date : {'$gte': date, '$lte' : index === datesArray.length - 1 ? new Date() : datesArray[index + 1]}},{company :  1, http_status : 1}));

        promises.push(requestPromise);
    });

    Promise.all(promises).then(function (requestSets) {
        requestSets.forEach(function (requests, index) {
            var point = {
                date : datesArray[index]
            };

            var separatedRequests = separateRequests(requests);

            Object.keys(separatedRequests).forEach(function (company) {
                point[company] = separatedRequests[company];
            });

            outputData.push(point);
        });

        res.json(outputData);
    });
};

exports.getRequestSuccessRate = getRequestSuccessRate;

function getRequestSuccessRate(start, end, company) {
    return buildRequestQuery({query: {start: start, end: end, company: company}}).then(function (requests) {
        var companies = {};
        requests.forEach(function (request) {
            if (!companies[request.company]) {
                companies[request.company] = {successful : 0, errored : 0, total : 0}
            }

            if (request.http_status === 200)
                companies[request.company].successful += 1;
            else
                companies[request.company].errored += 1;

            companies[request.company].total += 1;
        });

        return companies;
    });
}

function separateRequests(requests) {
    var outputObj = {};

    requests.forEach(function (request) {
        if (!outputObj[request.company]) {
            outputObj[request.company] = {errored : 0, successful : 0, total : 0};
        }

        if (request.http_status !== 200)
            outputObj[request.company].errored += 1;
        else
            outputObj[request.company].successful += 1;

        outputObj[request.company].total += 1;
    });

    return outputObj;
}

function buildRequestQuery(req, errorOnly) {
    var query = {date: {'$gte' : new Date(req.query.start || 0), '$lte' : req.query.end ? new Date(req.query.end): new Date()}};

    if (req.query.company && req.query.company !== 'all')
        query.company = params.company;

    if (errorOnly)
        query.http_status = {'$ne' : 200};

    return Requests.find(query);
}
