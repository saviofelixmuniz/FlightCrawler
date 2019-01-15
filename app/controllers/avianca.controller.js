/**
 * @author Sávio Muniz
 */
const errorSolver = require("../util/helpers/error-solver");
const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
var Parser = require('../util/helpers/parse-utils');
const exception = require('../util/services/exception');
const validator = require('../util/helpers/validator');
const MESSAGES = require('../util/helpers/messages');
const Requester = require ('../util/services/requester');
const CONSTANTS = require ('../util/helpers/constants');
const PreFlightServices = require('../util/services/preflight');

module.exports = {getFlightInfo: getFlightInfo, getTax: getTax, checkin: checkin};

async function getFlightInfo(req, res, next) {
    const START_TIME = (new Date()).getTime();

    console.log('Searching Avianca...');
    try {
        var params = {
            IP: req.clientIp,
            client: req.clientName || "",
            api_key: req.headers['authorization'],
            adults: req.query.adults,
            children: req.query.children,
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            originCountry: req.query.originCountry || 'BR',
            destinationCountry: req.query.destinationCountry || 'BR',
            forceCongener: false,
            infants: 0,
            executive: req.query.executive === 'true'
        };

        if (await PreFlightServices(params, START_TIME, 'avianca', res)) {
            return;
        }

        var aviancaResponse = await makeRequests(params, START_TIME, res);
        if (!aviancaResponse || !aviancaResponse.amigoResponse || !aviancaResponse.jsonResponse) return;

        if (isAmigoResponseInvalid(aviancaResponse.amigoResponse)) {
            exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
            return;
        }

        Formatter.responseFormat(aviancaResponse.amigoResponse, aviancaResponse.jsonResponse, params, 'avianca').then(async function (formattedResponse) {
            if (formattedResponse.error) {
                exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, formattedResponse.error, 500, MESSAGES.PARSE_ERROR, new Date());
                return;
            }

            if (!validator.isFlightAvailable(formattedResponse)) {
                exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                return;
            }

            var taxes = formattedResponse.taxes;
            delete formattedResponse.taxes;
            var request = await db.saveRequest('avianca', (new Date()).getTime() - START_TIME, params, null, 200, formattedResponse);
            await db.saveRequestResources(request._id, null, null, taxes);
            res.status(200);
            res.json({results: formattedResponse, id: request._id});
        });


    } catch (err) {
        errorSolver.solveFlightInfoErrors('avianca', err, res, START_TIME, params);
    }
}

function makeRequests(params, startTime, res) {
    return Promise.all([getJsonResponse(params, startTime, res), getAmigoResponse(params, startTime, res)]).then(function (results) {
        if (results[0].err) {
            throw {err : true, code : results[0].code, message : results[0].message, stack : results[0].stack};
        }
        if (results[1].err) {
            throw {err : true, code : results[0].code, message : results[0].message, stack : results[0].stack};
        }
        return {jsonResponse: results[0], amigoResponse: results[1]};
    });
}

async function getJsonResponse(params) {
    var session = Requester.createSession('avianca');

    try {

        var tokenUrl = 'https://www.pontosamigo.com.br/api/jsonws/aviancaservice.tokenasl/get-application-token';

        var body = await Requester.require({
            session: session,
            request: {
                url: tokenUrl
            }
        });

        console.log('AVIANCA:  ...got app token');
        var token = JSON.parse(body).accessToken;
        var availableCabinsUrl = `https://api.avianca.com.br/farecommercialization/routebasic/destinIataCode/${params.destinationAirportCode}/origIataCode/${params.originAirportCode}?access_token=${token}&locale=pt_BR`

        body = await Requester.require({
            session: session,
            request: {
                url: availableCabinsUrl
            }
        });

        console.log('AVIANCA:  ...got api first info');

        var payload = JSON.parse(body).payload;
        var cabins;
        if (payload && payload.length > 0) {
            for (var p of payload) {
                if (p.originAirport.iataCode === params.originAirportCode &&
                    p.destinationAirport.iataCode === params.destinationAirportCode) {
                    cabins = p.cabins;
                    break;
                }
            }
        }

        if (!cabins) {
            return {err: true, code: 404, message: MESSAGES.UNAVAILABLE};
        }

        var hasExecutiveCabin = false;
        var hasAwardCabin = false;
        for (var cabin of cabins) {
            if (cabin.type === 'Award') {
                hasAwardCabin = true;
            }
            if (cabin.type === 'Executive') {
                hasExecutiveCabin = true;
            }
        }

        if (!hasAwardCabin || (params.executive && !hasExecutiveCabin)) {
            return {err: true, code: 404, message: MESSAGES.UNAVAILABLE};
        }

        var tripFlowUrl = 'https://api.avianca.com.br/farecommercialization/generateurl/' +
            `ORG=${params.originAirportCode}&DST=${params.destinationAirportCode}` +
            `&OUT_DATE=${formatDate(params.departureDate)}&LANG=BR` + (params.returnDate ? `&IN_DATE=${formatDate(params.returnDate)}` : '') +
            `&COUNTRY=BR&QT_ADT=${params.adults}&QT_CHD=${params.children}&QT_INF=0&FLX_DATES=true` +
            `&CABIN=${params.executive ? 'Executive' : 'Economy'}` +
            `&SOURCE=DESKTOP_REVENUE&MILES_MODE=TRUE?access_token=${token}`;

        body = await Requester.require({
            session: session,
            request: {
                url: tripFlowUrl
            }
        });

        console.log('AVIANCA:  ...got api url response');

        var parsedBody = JSON.parse(body);
        var mainUrl = undefined;
        if (parsedBody.payload) {
            mainUrl = parsedBody.payload.url;
            if (mainUrl && mainUrl.indexOf('?') < 0) {
                mainUrl = mainUrl.substr(0, 61) + '?' + mainUrl.substr(61, mainUrl.length);
            }
        }
        else {
            return {err: true, code: 404, message: MESSAGES.UNAVAILABLE};
        }

        body = await Requester.require({
            session: session,
            request: {
                method: 'POST',
                url: mainUrl
            }
        });

        Requester.killSession(session);
        console.log('AVIANCA:  ...got api response');
        try {
            return Formatter.parseAviancaResponse(body);
        } catch (err) {
            return {err: err.stack, code: 400, message: MESSAGES.CRITICAL};
        }
    } catch (err) {
        Requester.killSession(session);
        let err_status = errorSolver.getHttpStatusCodeFromMSG(err.message);
        let err_code = parseInt(err_status);
        return {err: true, code: err_code, message: err.message, stack : err.stack}
    }
}

async function getAmigoResponse(params) {
    var session = Requester.createSession('avianca');

    try {
        var body = await Requester.require({
            session: session,
            request: {
                url: 'https://www.avianca.com.br/api/jsonws/aviancaservice.tokenasl/get-customer-token',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                form: {
                    'clientUsername': '',
                    'documentNumber': '74221172657',
                    'flyerId': '',
                    'clientPassword': 'Peidei2@18',
                    'userType': 'customer'
                }
            }
        });

        console.log('...Programa amigo: first');
        var token = JSON.parse(body);
        console.log('...Programa amigo: second');
        var loginForm = CONSTANTS.AVIANCA_LOGIN_FORM;

        await Requester.require({
            session: session,
            request: {
                url: 'https://www.avianca.com.br/login-avianca?p_p_id=com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB&p_p_lifecycle=1&p_p_state=normal&p_p_mode=view&p_p_col_id=column-1&p_p_col_pos=2&p_p_col_count=4&_com_avianca_portlet_AviancaLoginPortlet_INSTANCE_jrScpVbssXTB_javax.portlet.action=doLogin&p_auth=8lIHnGml',
                form: loginForm,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        });

        console.log('...Programa amigo: third');
        var tripFlowUrl = 'https://api.avianca.com.br/farecommercialization/generateurl/' +
            `ORG=${params.originAirportCode}&DST=${params.destinationAirportCode}` +
            `&OUT_DATE=${formatDate(params.departureDate)}&LANG=BR` + (params.returnDate ? `&IN_DATE=${formatDate(params.returnDate)}` : '') +
            `&COUNTRY=BR&QT_ADT=${params.adults}&QT_CHD=${params.children}&QT_INF=0&FLX_DATES=true` +
            `&CABIN=Award` +
            `&SOURCE=DESKTOP_REDEMPTION?access_token=${token.accessToken}`;

        var url = await Requester.require({
            session: session,
            request: {
                url: tripFlowUrl
            }
        });

        console.log('...Programa amigo: fourth');
        body = await Requester.require({
            session: session,
            request: {
                url: JSON.parse(url).payload.url
            }
        });

        console.log('...Programa amigo: fifth');
        Requester.killSession(session);
        return body;
    } catch (err) {
        Requester.killSession(session);
        let err_status = errorSolver.getHttpStatusCodeFromMSG(err.message);
        let err_code = parseInt(err_status);
        return {err: true, code: err_code, message: err.message, stack : err.stack}
    }
}

async function getTax(req, res, next) {
    try {
        var requestResources = await db.getRequestResources(req.query.requestId);
        if (!requestResources) {
            res.status(500);
            return;
        }
        var id = (req.query.goingFareId && req.query.returningFareId) ? req.query.goingFareId + '_' + req.query.returningFareId :
            (req.query.goingFareId ? req.query.goingFareId : req.query.returningFareId);
        res.json({tax: requestResources.resources[id].tax});
    } catch (err) {
        res.status(500).json({error : err.stack});
    }
}

function formatDate(date) {
    var splitDate = date.split('-');
    return splitDate[0] + splitDate[1] + splitDate[2];
}

function isAmigoResponseInvalid(response) {
    return response.indexOf('var generatedJSon') === -1;
}

async function checkin(req, res, next) {
    try {

        var tokenJson = await Requester.require({
            request: {
                url: 'https://checkin.si.amadeus.net/1ASIHSSCWEBO6/sscwo6/checkin?JsonMode=Y&Redirected=true&type=W&step=1',
                method: 'GET',
            }
        });

        let SITK = JSON.parse(tokenJson).SITK;

        var tripFlowUrl = 'https://checkin.si.amadeus.net/1ASIHSSCWEBO6/sscwo6/checkindirect?SITK='+SITK+'&JsonMode=Y&Redirected=true&type=W&ln=en';
        var response = await Requester.require({
            request: {
                url: tripFlowUrl,
                form: {
                    IDepartureDate: req.query.date,
                    IIdentificationBookingRef: req.query.locator,
                    submitIdentContinue: '',
                    SITK2: SITK
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        });

        let json = JSON.parse(response);
        SITK = json.SITK;

        if(json.viewName == 'PAXLIST' || json.viewName == 'IDENTIFICATION') {
            tripFlowUrl = 'https://checkin.si.amadeus.net/1ASIHSSCWEBO6/sscwo6/checkindirect?SITK='+SITK+'&JsonMode=Y&Redirected=true&type=W&ln=en';
            let form = {
                actionPaxListContinue: 'continue',
                SITK2:json.SITK
            }

            for(let i in json.viewData.passengers) {
                form['TPassengers_'+i+'_IPaxId'] = i;
                form['TPassengers_'+i+'_TPaxCheck'] = 'on';
            }

            response2 = await Requester.require({
                request: {
                    url: tripFlowUrl,
                    form: form,
                    headers: {
                        'Content-Type':'application/x-www-form-urlencoded'
                    }
                }
            }); 

            json = JSON.parse(response2);
        }

        if(json.viewData.messages) {
            if(json.viewData.messages[0].type == "Error") {
                res.status(500).json({error: true});
                return;
            }
        }
        
        let flights = [];
        let paxs = [];
        for(let i in json.identifyByContext.primePassengers) {
            paxs.push({
                name: json.identifyByContext.primePassengers[i].givenName,
                lastName: json.identifyByContext.primePassengers[i].surname
            })
        }

        if(json.viewData.journey) {
            let pathsJson = json.viewData.journey.flights;
            let paths = [];
            
            for(let p in pathsJson) {
                paths.push({
                    origem: pathsJson[p].boardpoint.airportCode,
                    destino: pathsJson[p].boardpoint.airportCode,
                    embarque: pathsJson[p].departureTime,
                    desembarque: pathsJson[p].offpoint.airportCode,
                    voo: pathsJson[p].operating.airline + pathsJson[p].operating.number,
                    status: pathsJson[p].status
                });
            }

            flights.push({ paths: paths });
        }

        for(let i in json.viewData.journeys) {
            let flight = json.viewData.journeys[i];
            let pathsJson = flight.flights;
            let paths = [];
            
            for(let p in pathsJson) {
                paths.push({
                    origem: pathsJson[p].boardpoint.airportCode,
                    destino: pathsJson[p].boardpoint.airportCode,
                    embarque: pathsJson[p].departureTime,
                    desembarque: pathsJson[p].offpoint.airportCode,
                    voo: pathsJson[p].operating.airline + pathsJson[p].operating.number,
                    status: pathsJson[p].status
                });
            }

            flights.push({ paths: paths });
        }
        
        res.json({ paxs: paxs, flights: flights });
    } catch (err) {
        res.status(500).json({error : err.stack});
    }
}