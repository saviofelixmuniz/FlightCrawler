/**
 * @author Sávio Muniz
 */

var schedule = require('node-schedule');
const Mail = require('./mail');
const Requests = require('../../controllers/stats.controller');

const Airports = require('../../db/models/airports');

const Time = require('../helpers/time-utils');
const Formatter = require('../helpers/format.helper');
const Messages = require('../helpers/messages');
const TaxCrawler = require('../airports/taxes/tax-crawler');

const ONE_HOUR = Time.transformTimeUnit('hour', 'mili', 1);
const ERROR_TOLERANCE = 0.3;
const TAX_DAYS_TOLERANCE = 14;
const TAX_TOLERANCE = Time.transformTimeUnit('day', 'mili', TAX_DAYS_TOLERANCE);

schedule.scheduleJob('0 * * * *', checkAPIHealth);
schedule.scheduleJob('0 0 * * *', renewAirportTaxInfo);

async function checkAPIHealth() {
    console.log('INITIATING HEALTH CHECK...');
    console.log(new Date());
    await Requests.getRequestSuccessRate(new Date().getTime() - ONE_HOUR, new Date().getTime()).then(async function (requests) {
        var companies = Object.keys(requests);
        for (var company of companies) {
            var companyName = Formatter.capitilizeFirstLetter(company);
            var errorRate = requests[company].errored / requests[company].total;
            if (errorRate >= ERROR_TOLERANCE) {
                console.log('Company with high error rate. Sending informative email...');

                var message = Messages.ERROR_RATE_MESSAGE(companyName, errorRate, requests[company].total);
                var subject = `FlightServer: ${companyName} está com taxa de erro alta`;

                await Mail.send('target', subject, message);
            }
        }
        console.log('...HEALTH CHECK DONE');
    });
}

async function renewAirportTaxInfo() {
    console.log('INITIATING AIRPORT TAX UPDATE...');
    var currentDate = new Date();
    console.log(currentDate);

    var toleranceDate = currentDate.getTime() - TAX_TOLERANCE;

    Airports.find({searched_at: {"$gte": toleranceDate}, updated_at: {"$lte": Time.getToday(0,0)}}).then(async function (airports) {
        for (var airport of airports) {
            console.log(`... refreshing ${airport.code}`);
            try {
                await TaxCrawler.crawlTax(airport.code, airport.company, false);
            } catch (e) {
                console.log(e);
            }
        }
    });
}