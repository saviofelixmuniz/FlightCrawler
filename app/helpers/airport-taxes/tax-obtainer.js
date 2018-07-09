var Airports = require('../../db/models/airports');
var TaxCrawler = require('./tax-crawler');

var taxes = {'latam': {}, 'azul': {}, 'gol': {}, 'avianca': {}};

exports.resetCacheTaxes = function (company) {
    taxes[company] = {}
};

exports.getTax = async function (airport, company) {
    if (!taxes[company][airport]) {
        var taxObj = await Airports.findOne({code: airport, company: company});
        var taxValue = 0;
        if (!taxObj)
            taxValue = await TaxCrawler.crawlTax(airport, company, true);
        else {
            taxValue = taxObj.tax;
            taxObj.searched_at = new Date();
            taxObj.save();
        }

        taxes[company][airport] = taxValue;
    }
    return taxes[company][airport];
};