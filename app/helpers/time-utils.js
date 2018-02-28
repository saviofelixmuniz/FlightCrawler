/**
 * @author Sávio Muniz
 */

var Parse = require('./parse-utils');
var MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

exports.getMonthLabel = getMonthLabel;

function getMonthLabel(month) {
    return MONTHS[month];
}

exports.formatDate = function (date) {
    return Parse.parseDigits(date.getUTCDate(), 2) + "/" +
        Parse.parseDigits((date.getUTCMonth() + 1), 2) + "/" +
        date.getUTCFullYear();

};