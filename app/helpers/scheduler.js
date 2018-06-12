/**
 * @author Sávio Muniz
 */

var schedule = require('node-schedule');
const Mail = require('./mail');
const Requests = require('../controllers/stats.controller');
const Time = require('./time-utils');
const Formatter = require('./format.helper');
const Messages = require('./messages');

const ONE_HOUR = Time.transformTimeUnit('hour', 'mili', 1);
const ERROR_TOLERANCE = 0.3;

schedule.scheduleJob('0 * * * *', checkAPIHealth);

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