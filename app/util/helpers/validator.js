/**
 * @author Sávio Muniz
 */

exports.validateFlightQuery = function (query) {
    return {success : 'okok'}
};

exports.isFlightAvailable = function (response) {
    if (!response) return false;

    var legs = Object.keys(response.Trechos);

    return (response.Trechos[legs[0]].Voos && response.Trechos[legs[0]].Voos.length > 0);
};