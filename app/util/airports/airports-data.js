var fs = require('fs');
var azulAirports = JSON.parse(fs.readFileSync('app/resource/azulAirports.json'))['data']['airports'];
var smilesAirports = JSON.parse(fs.readFileSync('app/resource/smilesAirports.json'));
var golAirports = JSON.parse(fs.readFileSync('app/resource/golAirports.json'))['AllAirports'];

exports.getAzulAirport = function (airportCode) {
    return azulAirports[airportCode];
};

exports.getSmilesAirport = function (airportCode) {
    return smilesAirports.find(function (airport) { return airport.code === airportCode; });
};

exports.getGolAirport = function (airportCode) {
    return golAirports.find(function (airport) { return airport.Initials === airportCode; });
};

exports.isInternationalTax = function () {

};