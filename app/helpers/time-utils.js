/**
 * @author Sávio Muniz
 */

var Parse = require('./parse-utils');
var MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MILI_IN_HOUR = 3600000;
const MINUTES_IN_HOUR = 60;

exports.getMonthLabel = getMonthLabel;

function getMonthLabel(month) {
    return MONTHS[month];
}
exports.formatDate = formatDate;

function formatDate (date) {
    return Parse.parseDigits(date.getUTCDate(), 2) + "/" +
        Parse.parseDigits((date.getUTCMonth() + 1), 2) + "/" +
        date.getUTCFullYear();

}

exports.getInterval = function (miliInterval) {
    var hours = miliInterval /  MILI_IN_HOUR;
    var decimalPart = hours - intPart(hours);
    var minutes = decimalPart * MINUTES_IN_HOUR;
    return Parse.parseDigits(intPart(hours), 2) + ':' + Parse.parseDigits(intPart(minutes), 2);
};

exports.getDateTime = function (dateTime) {
    return formatDate(dateTime) + " " + Parse.parseDigits(dateTime.getHours(), 2) + ":" + Parse.parseDigits(dateTime.getMinutes(),2);
};

function intPart(floatNumber) {
    return Number(String(floatNumber).split('.')[0]);
}