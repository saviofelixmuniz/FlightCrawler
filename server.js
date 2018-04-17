var express = require('express');
var app = express();
const bodyParser = require('body-parser');

require('./app/db/db');

const routes = require('./app/routes/index');

app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ limit: '1mb', extended: false }));
app.use('/api', routes);

app.listen(8081, function () {
    console.log('FlightServer running on port 8081...');
});