/**
 * @author Sávio Muniz
 */


exports.parseDigits = parseDigits;
exports.parseLocaleStringToNumber = parseLocaleStringToNumber;
exports.parseStringTimeToDate = parseStringTimeToDate;
exports.parseDateToString = parseDateToString;

function parseDigits(number, nDigits) {
    number = String(number);
    for (var i = 0; i < nDigits - 1; i++) {
        number = "0" + number;
    }

    return number.slice(nDigits * (-1));
}

function parseLocaleStringToNumber(stringValue) {
    return Number(stringValue.trim().replace('.', '').replace(',', '.'));
}

function parseStringTimeToDate(time) {
    var date = new Date();
    date.setHours(time.split(':')[0]);
    date.setMinutes(time.split(':')[1]);
    return date;
}

function parseDateToString(date) {
    return parseDigits(date.getDate(), 2) + "/" + parseDigits(date.getMonth() + 1, 2) + '/' + date.getFullYear()
}