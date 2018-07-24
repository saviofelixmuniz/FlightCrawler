/**
 * @author Sávio Muniz
 */

const Requests = require('../db/models/requests');

exports.getResponseTime = function (req, res) {
    try {
        buildRequestQuery(req).then(function (requests) {
            let sumCompanies = {};
            requests.forEach(function (request) {
                if (!sumCompanies[request.company]) {
                    sumCompanies[request.company] = {sum : 0, count: 0};
                }

                sumCompanies[request.company].sum += request.time;
                sumCompanies[request.company].count += 1;
            });
            
            let avgResult = {};
            
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
    getRequestSuccessRate(req.query.start, req.query.end, req.query.company).then(function (companies) {
        res.status(200);
        res.json(companies);
    });
};

exports.getRequestLogs = function (req, res) {
    buildRequestQuery(req, true).then(function (requests) {
        let companyLogs = {};
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
    let params = {
        start: Number(req.query.start),
        end: Number(req.query.end),
        company: req.query.company,
        granularity: req.query.granularity
    };

    let startDate = new Date(params.start);
    let endDate = new Date(params.end);

    let datesArray = [];


    let earliestDate = (await Requests.find({},{date : 1}).sort({date: 1}).limit(1))[0].date;
    let latestDate = (await Requests.find({},{date : 1}).sort({date: -1}).limit(1))[0].date;

    startDate = startDate > earliestDate ? startDate : earliestDate;
    endDate = endDate < latestDate ? endDate : latestDate;

    let itDate = startDate;

    while (itDate < endDate) {
        datesArray.push(new Date(itDate));
        itDate.setMinutes(itDate.getMinutes() + Number(params.granularity));
    }

    let outputData = [];
    let promises = [];

    datesArray.forEach(async function (date, index) {
        let requestPromise = (Requests.find({date : {'$gte': date, '$lte' : index === datesArray.length - 1 ? new Date() : datesArray[index + 1]}},{company :  1, http_status : 1}));

        promises.push(requestPromise);
    });

    Promise.all(promises).then(function (requestSets) {
        requestSets.forEach(function (requests, index) {
            let point = {
                date : datesArray[index]
            };

            let separatedRequests = separateRequests(requests);

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
        let companies = {};
        requests.forEach(function (request) {
            if (!companies[request.company]) {
                companies[request.company] = {successful : 0, errored : 0, total : 0}
            }

            if (request.http_status === 200)
                companies[request.company].successful += 1;
            else if (request.http_status !== 404)
                companies[request.company].errored += 1;

            companies[request.company].total += 1;
        });

        return companies;
    });
}

function separateRequests(requests) {
    let outputObj = {};

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

exports.getTopEconomy = function (req, res) {
    let n = Number(req.query.n);
    try {
        buildRequestQuery(req, false, true).then(function (requests) {
            let map = {};
            let flightList = [];
            let resultList = [];
            requests.forEach(function (request) {
                let paramsString = getParamsString(request.params);
                let existingRequest = map[paramsString];
                if (!existingRequest || existingRequest.date < request.date) {
                    map[paramsString] = request;
                }
            });
            for (m in map) {
                let request = map[m];
                if (!request.response) return;
                let trechos = request.response.Trechos;
                verifyEconomyRatio(trechos, flightList, resultList, request.params, n);
            }
            res.status(200);
            res.json({result: resultList});
        });
    } catch (e) {
        res.status(500);
        res.json(e);
    }
};

function getParamsString(params) {
    return JSON.stringify({
        adults: params.adults,
        departureDate: params.departureDate,
        returnDate: params.returnDate,
        originAirportCode: params.originAirportCode,
        destinationAirportCode: params.destinationAirportCode,
        executive: params.executive
    });
}

function formatOutput(params, flight) {
    let out = {
        params: params,
        flight: flight
    };

    return out;
}

function verifyEconomyRatio(trechos, flightList, resultList, params, n) {
    // add ratio for each flight
    for (trecho in trechos) {
        for (let flight of trechos[trecho]["Voos"]) {
            let ratio = getSmallerValue(flight["Milhas"]) / getSmallerValue(flight["Valor"]);
            if (ratio === 0) {
                continue;
            }
            flight["ratio"] = ratio;
            compareEconomyRatios(flight, flightList, resultList, params, n);
        }
    }
}

function getSmallerValue(values) {
    let smallest = Infinity;
    for (let value of values) {
        if (value["Adulto"] < smallest) smallest = value["Adulto"];
    }

    return smallest;
}

function compareEconomyRatios(flight, flightList, resultList, params, n) {
    let added = false;
    for (let i=0; i < flightList.length; i++) {
        if (flight.ratio < flightList[i].ratio) {
            flightList.splice(i, 0, flight);
            resultList.splice(i, 0, formatOutput(params, flight));
            added = true;
            if (flightList.length > n) {
                flightList.pop();
                resultList.pop();
            }
            break;
        }
    }

    if (!added && flightList.length < n) {
        flightList.push(flight);
        resultList.push(formatOutput(params, flight));
    }
}

function buildRequestQuery(req, errorOnly, successOnly) {
    let query = {date: {'$gte' : new Date(Number(req.query.start) || 0), '$lte' : req.query.end ? new Date(Number(req.query.end)): new Date()}};

    if (req.query.company && req.query.company !== 'all')
        query.company = req.query.company;

    if (errorOnly)
        query.http_status = {'$ne' : 200};
    else if (successOnly)
        query.http_status = {'$eq' : 200};

    return Requests.find(query);
}
