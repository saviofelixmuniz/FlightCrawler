/**
 * @author Sávio Muniz
 */
var express = require('express');
var Proxy = require('../helpers/proxy');
var test = require('../helpers/airport-taxes/tax-crawler');
var rootRouter = express.Router();
var Airports = require('../db/models/airports');
var gol = require('./flight/gol.route');
var avianca = require('./flight/avianca.route');
var azul = require('./flight/azul.route');
var latam = require('./flight/latam.route');
var stats = require('./flight/stats.route');
var skymilhas = require('./flight/skymilhas');
var auth = require('./flight/auth.route');
var exif = require('exif2');
var cheerio = require('cheerio');
var request = require('request-promise');

rootRouter.get('/', function(req, res, next) {
    res.send('respond with a resource');
});

rootRouter.use('/gol', gol);
rootRouter.use('/avianca',avianca);
rootRouter.use('/azul',azul);
rootRouter.use('/latam',latam);
rootRouter.use('/skymilhas',skymilhas);

rootRouter.use('/stats', stats);
rootRouter.use('/auth', auth);

rootRouter.get('/test', async function oi (req, res) {
    var referer = 'https://www.smiles.com.br/emissao-com-milhas?tripType=2&originAirport=SAO&destinationAirport=JPA&' +
                  'departureDate=1532782800000&returnDate=&adults=1&children=0&infants=0&searchType=both&segments=1&' +
                  'isElegible=false&originCity=&originCountry=&destinCity=&destinCountry=&' +
                  'originAirportIsAny=true&destinationAirportIsAny=false';


    request.get({url: referer, headers: {"user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36"}}).then(function (body) {
        var $ = cheerio.load(body);

        var image = $('#customDynamicLoading').attr('src').split('base64,')[1];

        var buffer = Buffer.from(image, 'base64');

        exif(buffer, function(err, obj){
            var strackId = batos(obj.image.XPTitle) + batos(obj.image.XPAuthor) + batos(obj.image.XPSubject) + batos(obj.image.XPComment);

            var headers = {
                "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36",
                "x-api-key": "aJqPU7xNHl9qN3NVZnPaJ208aPo2Bh2p2ZV844tw",
                "referer": referer,
                "x-strackid": strackId
            };

            console.log(strackId);

            request.get({url: 'https://flightavailability-prd.smiles.com.br/searchflights?adults=1&children=0&departureDate=2018-07-28&destinationAirportCode=JPA&forceCongener=false&infants=0&memberNumber=&originAirportCode=SAO',
                        headers: headers}).then(function (body) {
                console.log(body);
            });
        });

    });
});

function batos(ar){
    var outtext = "";
    var org = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T',
        'U','V','W','X','Y','Z','a','b','c','d','e','f','g','h','i','j','k','l','m','n',
        'o','p','q','r','s','t','u','v','w','x','y','z','0','1','2','3','4','5','6','7',
        '8','9','+','/','='];
    var dest = ['g','V','l','$','K','Z','Q','U','C','p','E','(','9','w','@','#','_','P','2','!',
        '3',']','5','4','A','=','1','O','0','i','s','&','k','f','u','X','D','o','/','%',
        'd','r','a','t','j','c','+','x','e','8','L',')','I','*','z','T','[','H','F','S',
        'M','6','Y','n','7'];
    for(var b in ar) {
        if (ar[b] != 0) {
            outtext = outtext + org[dest.indexOf(String.fromCharCode(ar[b]))];
        }
    }
    return outtext;
}

rootRouter.get('/proxytest', async function proxyTest (req, res) {
    var ip = await Proxy.setupAndRotateRequestLib('request-promise', 'onecompany').get('https://api.ipify.org?format=json');
    res.json(JSON.parse(ip));
});

module.exports = rootRouter;