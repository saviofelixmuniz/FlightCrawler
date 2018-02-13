var express = require('express');
var app = express();

const routes = require('./app/routes/index');

app.get('/', function (req, res) {
    res.send('Hello World!');
});

app.use('/api', routes);

app.listen(3000, function () {
    console.log('FlightServer running on port 3000...');
});