/**
 * @author Sávio Muniz
 */

const request = require('requestretry');
const db = require('../helpers/db-helper');
const CONSTANTS = require('../helpers/constants');
const Formatter = require('../helpers/format.helper');
const exception = require('../helpers/exception');
const validator = require('../helpers/validator');
const MESSAGES = require('../helpers/messages');
const http = require('http');
const { URL, URLSearchParams } = require('url');

const HOST = 'https://flightavailability-green.smiles.com.br/';
const PATH = 'searchflights';


module.exports = getFlightInfo;

function getFlightInfo(req, res, next) {
    const START_TIME = (new Date()).getTime();

    try {
        var params = {
            adults: req.query.adults,
            children: req.query.children,
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            forceCongener: false,
            infants: 0
        };
        var headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        var baseForm = CONSTANTS.AVIANCA_FORM_BASE;

        var formData = {
            E_LOCATION_1: params.destinationAirportCode,
            B_DATE_2: formatDate(params.returnDate),
            FIELD_ADT_NUMBER: params.adults,
            FIELD_CHD_NUMBER: params.children,
            B_DATE_1: formatDate(params.departureDate),
            B_LOCATION_1: params.originAirportCode,
        };

        Object.keys(baseForm).forEach(function (keyForm) {
            formData[keyForm] = baseForm[keyForm];
        });

        var url = 'https://wftc1.e-travel.com/plnext/AviancaBRDX/Override.action?__utma=1.491497236.1520272490.1520272490.1520272490.1&__utmb=1.3.9.1520272549843&__utmc=1&__utmx=-&__utmz=1.1520272490.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none)&__utmv=-&__utmk=5915827&_ga=2.26425722.651308243.1520272490-491497236.1520272490';
        request.post({url: url, form: formData, headers: headers, proxy: CONSTANTS.PROXY_URL}).then(function (response) {
            var parsed = Formatter.parseAviancaResponse(response);

            var formattedResponse = Formatter.responseFormat(parsed, null, params, 'avianca');

            if (formattedResponse.error) {
                exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, formattedResponse.error, 400, MESSAGES.PARSE_ERROR, new Date());
                return;
            }

            if (!validator.isFlightAvailable(formattedResponse)) {
                exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, MESSAGES.UNAVAILABLE, 404, MESSAGES.UNAVAILABLE, new Date());
                return;
            }

            // var formattedResponse = {};

            // res.json({
            //     formatted : formattedResponse,
            //     original_data : parsed
            // })

            res.json(formattedResponse);
            db.saveRequest('avianca', (new Date()).getTime() - START_TIME, params, null, 200, new Date());
        });
    } catch (e) {
        exception.handle(res, 'avianca', (new Date()).getTime() - START_TIME, params, err, 400, MESSAGES.CRITICAL, new Date());
    }
}

function formatDate(date) {
    var splitDate = date.split('-');
    return splitDate[0] + splitDate[1] + splitDate[2] + '0000';
}