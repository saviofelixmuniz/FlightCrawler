/**
 * @author Sávio Muniz
 */


exports.parseDigits = parseDigits;
exports.parseLocaleStringToNumber = parseLocaleStringToNumber;
exports.parseStringTimeToDate = parseStringTimeToDate;

function parseDigits (number, nDigits) {
    number = String(number);
    for (var i = 0; i < nDigits - 1; i++) {
        number = "0" + number;
    }

    return number.slice(nDigits * (-1));
}

function parseLocaleStringToNumber(stringValue) {
    return stringValue.trim().replace('.','').replace(',', '.');
}

function parseStringTimeToDate(time) {
    var date = new Date();
    date.setHours(time.split(':')[0]);
    date.setMinutes(time.split(':')[1]);
    return date;
}