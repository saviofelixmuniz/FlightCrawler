var express = require('express');
var cors = require('cors');
var app = express();
const bodyParser = require('body-parser');
const requestIp = require('request-ip');

require('./app/db/db');
require('./app/util/services/scheduler');

const routes = require('./app/routes/index');

app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ limit: '1mb', extended: false }));
app.use(requestIp.mw());
app.use('/api', routes);

var server = app.listen(8081, function () {
    console.log('FlightServer running on port 8081...');
    console.log(`=Proxy is turned ${process.env.PROXY_ON === 'true'? 'ON': 'OFF'}=`);
});

server.timeout = 300000;