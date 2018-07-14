var Airports = require('../../db/models/airports');
var TaxCrawler = require('./tax-crawler');

var taxes = {'latam': {}, 'azul': {}, 'gol': {}, 'avianca': {}};

exports.resetCacheTaxes = function (company) {
    taxes[company] = {}
};

exports.getTax = async function (airport, company, originCountry, destinationCountry, isGoing) {

    if (!taxes[company][airport]) {
        var internationalFee = isInternationalFee(originCountry, destinationCountry, isGoing);
        var query = internationalFee ? {code: airport, company: company, international: internationalFee} :
                                    {code: airport, company: company, international: {$in: [false, null]}};
        var taxObj = await Airports.findOne(query);
        var taxValue = 0;
        if (!taxObj || !taxObj.tax)
            taxValue = await TaxCrawler.crawlTax(airport, company, true, internationalFee);
        else {
            taxValue = taxObj.tax;
            taxObj.searched_at = new Date();
            taxObj.save();
        }

        taxes[company][airport] = taxValue;
    }
    return taxes[company][airport];
};

function isInternationalFee(originCountry, destinationCountry, isGoing) {
    return originCountry !== destinationCountry &&
            isGoing && originCountry === 'BR' ||
            !isGoing && destinationCountry === 'BR'
}