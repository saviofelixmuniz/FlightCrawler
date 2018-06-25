/**
 * @author Sávio Muniz
 */


exports.parseDigits = parseDigits;
exports.parseLocaleStringToNumber = parseLocaleStringToNumber;
exports.parseStringTimeToDate = parseStringTimeToDate;
exports.parseDateToString = parseDateToString;
exports.isNumber = isNumber;

function parseDigits (number, nDigits) {
    number = String(number);
    for (var i = 0; i < nDigits - 1; i++) {
        number = "0" + number;
    }

    return number.slice(nDigits * (-1));
}


function isNumber(stringValue){
    return ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].indexOf(stringValue.substring(0, 1)) > -1
}

function parseLocaleStringToNumber(stringValue) {
    return stringValue ? Number(stringValue.trim().replace('.','').replace(',', '.')) : 0;
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