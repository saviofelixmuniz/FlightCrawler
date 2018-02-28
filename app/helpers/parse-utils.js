/**
 * @author Sávio Muniz
 */


exports.parseDigits = parseDigits;

function parseDigits (number, nDigits) {
    number = String(number);
    for (var i = 0; i < nDigits - 1; i++) {
        number = "0" + number;
    }

    return number.slice(nDigits * (-1));
}