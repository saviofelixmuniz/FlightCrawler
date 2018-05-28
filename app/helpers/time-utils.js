/**
 * @author Sávio Muniz
 */

var Parse = require('./parse-utils');
var MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MILI_IN_HOUR = 3600000;
const MINUTES_IN_HOUR = 60;

exports.getMonthLabel = getMonthLabel;
exports.getLabelMonth = getLabelMonth;

function getMonthLabel(month) {
    return MONTHS[month];
}

exports.getFlightDates = getFlightDates;

function getFlightDates(date, departureTime, arrivalTime) {
    var returnDate = new Date();

    returnDate.setFullYear(date.split('-')[0]);
    returnDate.setMonth(Number(date.split('-')[1]) - 1);
    returnDate.setDate(date.split('-')[2]);

    var departureDate = new Date(returnDate.getTime());

    var departureDateTime = new Date();
    departureDateTime.setHours(departureTime.split(':')[0]);
    departureDateTime.setMinutes(departureTime.split(':')[1]);

    var arrivalDateTime = new Date();
    arrivalDateTime.setHours(arrivalTime.split(':')[0]);
    arrivalDateTime.setMinutes(arrivalTime.split(':')[1]);

    if (departureTime > arrivalTime)
        returnDate.setDate(returnDate.getDate() + 1);


    return {
        departure : Parse.parseDateToString(departureDate),
        arrival : Parse.parseDateToString(returnDate)
    }
}


function getLabelMonth(monthLabel) {
    return Parse.parseDigits(MONTHS.indexOf(monthLabel.toUpperCase()) + 1, 2);
}

exports.formatDate = formatDate;

function formatDate (date) {
    var day = date.getUTCDate();
    var dia = Parse.parseDigits(date.getUTCDate(), 2);
    return Parse.parseDigits(date.getUTCDate(), 2) + "/" +
        Parse.parseDigits((date.getUTCMonth() + 1), 2) + "/" +
        date.getUTCFullYear();

}

exports.getInterval = getInterval;

function getInterval (miliInterval) {
    var hours = miliInterval /  MILI_IN_HOUR;
    var decimalPart = hours - intPart(hours);
    var minutes = decimalPart * MINUTES_IN_HOUR;
    return Parse.parseDigits(intPart(hours), 2) + ':' + Parse.parseDigits(intPart(minutes), 2);
}

exports.getDateTime = function (dateTime) {
    return formatDate(dateTime) + " " + Parse.parseDigits(dateTime.getHours(), 2) + ":" + Parse.parseDigits(dateTime.getMinutes(),2);
};


function intPart(floatNumber) {
    return Number(String(floatNumber).split('.')[0]);
}