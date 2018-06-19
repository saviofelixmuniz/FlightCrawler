var fs = require('fs');
var airports = JSON.parse(fs.readFileSync('app/resource/airports.json'))['data']['airports'];

exports.getAirport = function (airportCode) {
    return airports[airportCode];
};