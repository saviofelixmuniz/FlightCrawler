/**
 * @author Sávio Muniz
 */

const request = require('requestretry');
const Formatter = require('../helpers/format.helper');

var fs = require('fs');

module.exports = getFlightInfo;

async function getFlightInfo(req, res, next) {
    var result = null;
    await request.get({
        url: 'https://book.latam.com/TAM/dyn/air/redemption/availability;jsessionid=stKN3-G0EGrz33wUaVAysS98pHH03hIrraewI88r2Fb51Ex0ICVD!522968718!1701001221?B_DATE_1=201802130000&B_LOCATION_1=BHZ&LANGUAGE=BR&WDS_MARKET=BR&passenger_useMyPoints=true&children=0&E_LOCATION_1=SAO&SERVICE_ID=2&SITE=JJRDJJRD&COUNTRY_SITE=BR&MARKETING_CABIN=E&adults=1&infants=0&TRIP_TYPE=O',
        maxAttempts: 3,
        retryDelay: 150
    }).then(function (response) {
        console.log('...got a read');
        result = response.body;
        return result;
    }, function (err) {
        result = err;
        return result;
    });


    res.json(Formatter.parseLatamResponse(result));

}