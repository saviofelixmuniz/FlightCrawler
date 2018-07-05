var fs = require('fs');
var airports = JSON.parse(fs.readFileSync('app/resource/airports.json'))['data']['airports'];
var golAirports = JSON.parse(fs.readFileSync('app/resource/golAirports.json'))['AllAirports'];

exports.getAirport = function (airportCode) {
    return airports[airportCode];
};

exports.getGolAirport = function (airportCode) {
    return golAirports.find(function (airport) { return airport.Initials === airportCode; });
};