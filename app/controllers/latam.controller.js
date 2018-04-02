/**
 * @author Sávio Muniz
 */

const request = require('requestretry');
const Formatter = require('../helpers/format.helper');
const CONSTANTS = require('../helpers/constants');

const request2 = require('request');
const cookieJar = request.jar();

var fs = require('fs');

module.exports = getFlightInfo;

const LATAM_TEMPLATE_CHANGE_DATE = CONSTANTS.LATAM_TEMPLATE_CHANGE_DATE;

function formatNewCashUrl (params) {
    var url = `https://www.latam.com/pt_br/apps/personas/booking?fecha1_dia=11&fecha1_anomes=2018-04&fecha2_dia=11&
               fecha2_anomes=2018-05&from_city2=SAO&to_city2=JPA&auAvailability=1&ida_vuelta=ida_vuelta&from_city1=JPA&
               to_city1=SAO&flex=1&vuelos_fecha_salida_ddmmaaaa=11/04/2018&vuelos_fecha_regreso_ddmmaaaa=11/05/2018&
               cabina=Y&nadults=1&nchildren=0&ninfants=0`.replace(/\s+/g, '');
    return url;
}

function formatOldRedeemUrl(params) {
    var url =  `https://book.latam.com/TAM/dyn/air/redemption/availability;jsessionid=96_YERVnseBRWRvsSYipVzCPizdWG891BBKYOOJ49Tt6v0bVmSE-!-857973753!1314580488?
            B_DATE_1=${formatDate(params.departureDate)}&B_LOCATION_1=${params.originAirportCode}&LANGUAGE=BR
            &passenger_useMyPoints=true&WDS_MARKET=BR&children=${params.children}&E_LOCATION_1=${params.destinationAirportCode}&
            SERVICE_ID=2&SITE=JJRDJJRD&COUNTRY_SITE=BR&MARKETING_CABIN=E&adults=${params.adults}&infants=${params.infants}&TRIP_TYPE=R`.replace(/\s+/g, '');
    if (params.returnDate)
        url += `&B_DATE_2=${formatDate(params.returnDate)}`;

    return url;
}

function formatOldCashUrl(params) {
    var url = `http://book.latam.com/TAM/dyn/air/booking/upslDispatcher?B_LOCATION_1=${params.originAirportCode}&
            E_LOCATION_1=${params.destinationAirportCode}&TRIP_TYPE=R&B_DATE_1=${formatDate(params.departureDate)}&
            adults=${params.adults}&children=${params.children}&infants=${params.infants}&
            LANGUAGE=BR&SITE=JJBKJJBK&WDS_MARKET=BR&MARKETING_CABIN=E`.replace(/\s+/g, '');
    if (params.returnDate)
        url += `&B_DATE_2=${formatDate(params.returnDate)}`;

    return url;
}

function formatDate(date) {
    var splitDate = date.split('-');
    return splitDate[0] + splitDate[1] + splitDate[2] + '0000';
}

function getFlightInfo(req, res, next) {
    var redeemResult = null;

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

    var returnDate = new Date();
    returnDate.setDate(params.returnDate.split('-')[2]);
    returnDate.setMonth(params.returnDate.split('-')[1] - 1);
    returnDate.setFullYear(params.returnDate.split('-')[0]);

    if (returnDate < LATAM_TEMPLATE_CHANGE_DATE) {
        request.get({
            url: formatOldRedeemUrl(params),
            maxAttempts: 3,
            retryDelay: 150
        }).then(function (response) {
            console.log('...got a read');
            redeemResult = response.body;
            var cashResult = null;

            request.get({
                url: formatOldCashUrl(params),
                maxAttempts: 3,
                retryDelay: 150
            }).then(function (response) {
                console.log('...got a read');
                cashResult = response.body;
                // console.log(cashResult);
                // console.log(redeemResult);

                var formattedData = Formatter.responseFormat(redeemResult, cashResult, params, 'latam');
                // var data = {
                //     formattedData : formattedData,
                //     tamCashData : ''
                // };
                res.json(formattedData);

            }, function (err) {
                cashResult = err;
                return cashResult;
            });
        }, function (err) {
            redeemResult = err;
            return redeemResult;
        });
    }

    else {
        console.log('NEW FORMAT!!!');
        var headers = {
            'pragma':'no-cache',
            'upgrade-insecure-requests':1,
            'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36'
        };


        var headers2 = {
            'Accept-Encoding':'compress, gzip',
            'Access-Control-Allow-Origin':'https://www.latam.com',
            'Access-Control-Expose-Headers':'x-flow-id, x-track-id, x-request-id, api-version, content-length, content-md5, content-type, date, request-id, response-time',
            'Cache-Control':'public',
            'Connection':'keep-alive',
            'Content-Encoding':'gzip',
            'Content-Length':'4593',
            'Content-Type':'application/json',
            'Date':'Mon, 02 Apr 2018 12:50:37 GMT',
            'Server':'Apache/2.4.6 (CentOS) OpenSSL/1.0.1e-fips',
            'Strict-Transport-Security':'max-age=86400',
            'Vary':'Accept-Encoding',
            'X-Apache':'(null)[at]bff.latam.com',
            'x-flow-id':'cd2836df-669f-44f3-b819-ace2f37f8267',
            'x-request-id':'91988542-13c1-4d77-8a3e-bf1f7b9e2fd9',
            'x-result-id':'QmGz5xlGsXZEsArggzQo46Yqm',
            'x-session-id':'LRP0SUQEj8k3PBqFlTXWcRC6O',
            'x-track-id':'6358474276'
        };

        var headers1 = {
            'Upgrade-Insecure-Requests':1,
            'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36'
        };

        request2.get({url : 'https://www.latam.com/pt_br/', jar: cookieJar}, function () {
            request2.get({
                url: 'http://www.latam.com/pt_br/apps/personas/booking?fecha1_dia=11&fecha1_anomes=2018-04&fecha2_dia=11&fecha2_anomes=2018-05&from_city2=SAO&to_city2=JPA&auAvailability=1&ida_vuelta=ida_vuelta&vuelos_origen=Jo%C3%A3o%20Pessoa&from_city1=JPA&vuelos_destino=S%C3%A3o%20Paulo&to_city1=SAO&flex=1&vuelos_fecha_salida_ddmmaaaa=11/04/2018&vuelos_fecha_regreso_ddmmaaaa=11/05/2018&cabina=Y&nadults=1&nchildren=0&ninfants=0',
                jar: cookieJar,
                headers : headers1
            },function (err, response, body) {
                request2.get({
                    url: 'https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/revenue/recommendations/outbound?country=BR&language=PT&home=pt_br&origin=JPA&destination=SAO&departure=2018-04-11&adult=1&cabin=Y&return=2018-05-11',
                    jar : cookieJar,
                    headers : headers2
                }, function (err, response, body) {
                    console.log('...got a read');
                    var cashResult = body;
                    
                    res.send(cashResult)

                    // var formattedData = Formatter.responseFormat(redeemResult, cashResult, params, 'latam');
                    // // var data = {
                    // //     formattedData : formattedData,
                    // //     tamCashData : ''
                    // // };
                    // res.json(formattedData);
                });
            });
        });

    }
}