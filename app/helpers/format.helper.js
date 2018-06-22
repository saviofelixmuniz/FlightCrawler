/**
 * @author Sávio Muniz
 */

var airport = require('./airports').getAirport;

var formatters = {
    gol : require('./response-formatters/gol.formatter'),
    latam : require('./response-formatters/latam.formatter'),
    avianca : require('./response-formatters/avianca.formatter'),
    azul : require('./response-formatters/azul.formatter')
};

const { URL, URLSearchParams } = require('url');

exports.urlFormat = urlFormat;
exports.parseLatamResponse = parseLatamResponse;
exports.responseFormat = responseFormat;
exports.parseAviancaResponse = parseAviancaResponse;
exports.formatAzulForm = formatAzulForm;
exports.capitilizeFirstLetter = capitilizeFirstLetter;
exports.formatAzulHeaders = formatAzulHeaders;

function urlFormat(root, path, params) {
    const myURL = new URL(path, root);
    Object.keys(params).forEach(function (param) {
        if (params[param])
            myURL.searchParams.append(param, params[param]);
    });
    return myURL.href;
}

function parseLatamResponse (response) {
    var json = response.split('<script> var clientSideData = ')[1].split('; </script> <script')[0];
    json = json.replace(/="/g,"='");
    json = json.split('; var clientMessages = ')[0];
    return JSON.parse(json);
}

function parseAviancaResponse(response) {
    return JSON.parse(response.split('config : ')[1].split('});')[0].split(', pageEngine')[0]);
}

function formatAzulForm(params, oneWay) {
    var originAirport = airport(params.originAirportCode);
    var destinationAirport = airport(params.destinationAirportCode);
    if (!oneWay)
        return {
        '_authkey_': '106352422A4DEB0810953636A6FBE2079955529786098DE8B0D32416202E380E34C245FA99C431C7C7A75560FDE65150',
        'ControlGroupSearch$SearchMainSearchView$TextBoxPromoCode': 'CALLCENT',
        'culture': 'pt-BR',
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay1': `${params.departureDate.split('-')[2]}`,
        'departure1': `${params.departureDate.split('-')[2]}/${params.departureDate.split('-')[1]}/${params.departureDate.split('-')[0]}`,
        'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacDestination1': destinationAirport.isMac ? 'on' : '',
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT': '0',
        'originIata1': `${params.originAirportCode}`,
        'origin1': `${originAirport.name} (${params.originAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$TextBoxMarketOrigin1': `${originAirport.name} (${params.originAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$TextBoxMarketDestination1': `${destinationAirport.name} (${params.destinationAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacOrigin1': originAirport.isMac ? 'on' : '',
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth1': `${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
        'ControlGroupSearch$SearchMainSearchView$RadioButtonMarketStructure': 'RoundTrip',
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth2': `${params.departureDate.split('-')[0]}-${params.returnDate.split('-')[1]}`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_ADT': `${params.adults || 1}`,
        'arrival': `${params.returnDate.split('-')[2]}/${params.returnDate.split('-')[1]}/${params.returnDate.split('-')[0]}`,
        'destinationIata1': `${params.destinationAirportCode}`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes': 'R',
        '__EVENTTARGET': 'ControlGroupSearch$LinkButtonSubmit',
        'destination1': `${destinationAirport.name} (${params.destinationAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay2': `${params.returnDate.split('-')[2]}`,
        'hdfSearchCodeDeparture1': originAirport.searchCode,
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD': `${params.children}`,
        'hdfSearchCodeArrival1': destinationAirport.searchCode,
        'ControlGroupSearch$SearchMainSearchView$DropDownListSearchBy': 'columnView'};
    else
        return {
        '_authkey_': '106352422A4DEB0810953636A6FBE2079955529786098DE8B0D32416202E380E34C245FA99C431C7C7A75560FDE65150',
        'ControlGroupSearch$SearchMainSearchView$TextBoxPromoCode': 'CALLCENT',
        'culture': 'pt-BR',
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD': `${params.children}`,
        'departure1': `${params.departureDate.split('-')[2]}/${params.departureDate.split('-')[1]}/${params.departureDate.split('-')[0]}`,
        'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacDestination1': destinationAirport.isMac ? 'on' : '',
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT': '0',
        'originIata1': `${params.originAirportCode}`,
        'origin1': `${airport(params.originAirportCode)} (${params.originAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$TextBoxMarketOrigin1': `${airport(params.originAirportCode)} (${params.originAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$TextBoxMarketDestination1': `${airport(params.destinationAirportCode)} (${params.destinationAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacOrigin1': originAirport.isMac ? 'on' : '',
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth1': `${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
        'ControlGroupSearch$SearchMainSearchView$RadioButtonMarketStructure': 'OneWay',
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_ADT': `${params.adults}`,
        'destinationIata1': `${params.destinationAirportCode}`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes': 'R',
        '__EVENTTARGET': 'ControlGroupSearch$LinkButtonSubmit',
        'destination1': `${airport(params.destinationAirportCode)} (${params.destinationAirportCode})`,
        'hdfSearchCodeDeparture1': '1N',
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay1': `${params.departureDate.split('-')[2]}`,
        'hdfSearchCodeArrival1': '1N',
        'ControlGroupSearch$SearchMainSearchView$DropDownListSearchBy': 'columnView'
    }
}

function responseFormat(jsonRedeemResponse, jsonCashResponse, searchParams, company, cookieJar) {
    return formatters[company](jsonRedeemResponse, jsonCashResponse, searchParams, cookieJar);
}

function capitilizeFirstLetter(string) {
    return string[0].toUpperCase() + string.slice(1);
}

function formatAzulHeaders(formData) {
    return {
        'Origin': 'https',
        'Content-Length': Buffer.byteLength(JSON.stringify(formData)),
        'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Host': 'viajemais.voeazul.com.br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Upgrade-Insecure-Requests': '1',
        'Content-Type': 'application/x-www-form-urlencoded'
    };
}