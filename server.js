var express = require('express');
var app = express();

const routes = require('./app/routes/index');

app.use('/api', routes);

app.listen(8081, function () {
    console.log('FlightServer running on port 8081...');
});