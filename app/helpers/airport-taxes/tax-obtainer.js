var Airports = require('../../db/models/airports');
var TaxCrawler = require('./tax-crawler');

var taxes = {'latam': {}, 'azul': {}, 'gol': {}, 'avianca': {}};

exports.resetCacheTaxes = function (company) {
    taxes[company] = {}
};

exports.getTax = async function (airport, company) {
    if (!taxes[company][airport]) {
        var tax = await Airports.findOne({code: airport, company: company}, '', {lean: true}).exec();
        if (!tax)
            tax = await TaxCrawler.crawlTax(airport, company, true);
        else
            tax = tax.tax;
        taxes[company][airport] = tax;
    }
    return taxes[company][airport];
};