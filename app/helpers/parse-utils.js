/**
 * @author Sávio Muniz
 */


exports.parseDigits = parseDigits;
exports.parseLocaleStringToNumber = parseLocaleStringToNumber;

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