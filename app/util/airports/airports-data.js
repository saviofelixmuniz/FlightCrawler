let fs = require('fs');
let airports = JSON.parse(fs.readFileSync('app/resource/airports.json'))['data']['airports'];
let smilesAirports = JSON.parse(fs.readFileSync('app/resource/smilesAirports.json'));
let golAirports = JSON.parse(fs.readFileSync('app/resource/golAirports.json'))['AllAirports'];

exports.getAirport = function (airportCode) {
    return airports[airportCode];
};

exports.getSmilesAirport = function (airportCode) {
    return smilesAirports.find(function (airport) { return airport.code === airportCode; });
};

exports.getGolAirport = function (airportCode) {
    return golAirports.find(function (airport) { return airport.Initials === airportCode; });
};

exports.isInternationalTax = function () {

};