const Properties = require('../../../db/models/properties');

module.exports = async function (company, session) {
    var proxySettings = (await Properties.findOne({key: "luminati_proxy_settings"})).value[company];
    return `http://lum-customer-incodde-zone-${proxySettings.zone}-country-${proxySettings.country}
    ${proxySettings.zone === "mobile"? "-city-saopaulo": ""}-session-${session}:
    ${proxySettings.password}@zproxy.lum-superproxy.io:22225`.replace(/\s+/g, '');
};