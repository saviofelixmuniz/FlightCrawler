/**
 * @author Sávio Muniz
 */

var airport = require('../airports/airports-data').getAirport;

var formatters = {
    gol : require('../response-formatters/gol.formatter'),
    latam : require('../response-formatters/latam.formatter'),
    avianca : require('../response-formatters/avianca.formatter'),
    azul : require('../response-formatters/azul.formatter')
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
    if (!originAirport || !destinationAirport) {
        return null;
    }

    if (!oneWay) {
        return {
            '_authkey_': '106352422A4DEB0810953636A6FBE2079955529786098DE8B0D32416202E380E34C245FA99C431C7C7A75560FDE65150',
            'ControlGroupSearch$SearchMainSearchView$TextBoxPromoCode': 'CALLCENT',
            'culture': 'pt-BR',
            'ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay1': `${params.departureDate.split('-')[2]}`,
            'departure1': `${params.departureDate.split('-')[2]}/${params.departureDate.split('-')[1]}/${params.departureDate.split('-')[0]}`,
            'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacDestination1': destinationAirport.isMac ? 'on' : '',
            'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT': '0',
            'originIata1': `${originAirport.code}`,
            'origin1': `${originAirport.name} (${originAirport.code})`,
            'ControlGroupSearch$SearchMainSearchView$TextBoxMarketOrigin1': `${originAirport.name} (${originAirport.code})`,
            'ControlGroupSearch$SearchMainSearchView$TextBoxMarketDestination1': `${destinationAirport.name} (${destinationAirport.code})`,
            'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacOrigin1': originAirport.isMac ? 'on' : '',
            'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth1': `${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
            'ControlGroupSearch$SearchMainSearchView$RadioButtonMarketStructure': 'RoundTrip',
            'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth2': `${params.departureDate.split('-')[0]}-${params.returnDate.split('-')[1]}`,
            'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_ADT': `${params.adults || 1}`,
            'arrival': `${params.returnDate.split('-')[2]}/${params.returnDate.split('-')[1]}/${params.returnDate.split('-')[0]}`,
            'destinationIata1': `${destinationAirport.code}`,
            'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes': 'R',
            '__EVENTTARGET': 'ControlGroupSearch$LinkButtonSubmit',
            'destination1': `${destinationAirport.name} (${destinationAirport.code})`,
            'ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay2': `${params.returnDate.split('-')[2]}`,
            'hdfSearchCodeDeparture1': originAirport.searchCode,
            'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD': `${params.children}`,
            'hdfSearchCodeArrival1': destinationAirport.searchCode,
            'ControlGroupSearch$SearchMainSearchView$DropDownListSearchBy': 'columnView'
        };
    }
    else
        return {
        '_authkey_': '106352422A4DEB0810953636A6FBE2079955529786098DE8B0D32416202E380E34C245FA99C431C7C7A75560FDE65150',
        'ControlGroupSearch$SearchMainSearchView$TextBoxPromoCode': 'CALLCENT',
        'culture': 'pt-BR',
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD': `${params.children}`,
        'departure1': `${params.departureDate.split('-')[2]}/${params.departureDate.split('-')[1]}/${params.departureDate.split('-')[0]}`,
        'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacDestination1': destinationAirport.isMac ? 'on' : '',
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT': '0',
        'originIata1': `${originAirport.code}`,
        'origin1': `${originAirport.name} (${originAirport.code})`,
        'ControlGroupSearch$SearchMainSearchView$TextBoxMarketOrigin1': `${originAirport.name} (${originAirport.code})`,
        'ControlGroupSearch$SearchMainSearchView$TextBoxMarketDestination1': `${destinationAirport.name} (${destinationAirport.code})`,
        'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacOrigin1': originAirport.isMac ? 'on' : '',
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth1': `${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
        'ControlGroupSearch$SearchMainSearchView$RadioButtonMarketStructure': 'OneWay',
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_ADT': `${params.adults}`,
        'destinationIata1': `${destinationAirport.code}`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes': 'R',
        '__EVENTTARGET': 'ControlGroupSearch$LinkButtonSubmit',
        'destination1': `${destinationAirport.name} (${destinationAirport.code})`,
        'hdfSearchCodeDeparture1': originAirport.searchCode,
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay1': `${params.departureDate.split('-')[2]}`,
        'hdfSearchCodeArrival1': destinationAirport.searchCode,
        'ControlGroupSearch$SearchMainSearchView$DropDownListSearchBy': 'columnView'
    }
}

function responseFormat(jsonRedeemResponse, jsonCashResponse, searchParams, company, cookieJar) {
    return formatters[company](jsonRedeemResponse, jsonCashResponse, searchParams, cookieJar);
}

function capitilizeFirstLetter(string) {
    return string[0].toUpperCase() + string.slice(1);
}

function formatAzulHeaders(formData, method) {
    var baseHeader =  {
        'Origin': 'https',
        'Accept-Encoding': 'gzip, deflate, br',
        'Host': 'viajemais.voeazul.com.br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36'
    };

    if (method === 'post') {
        baseHeader['Content-Length'] = Buffer.byteLength(JSON.stringify(formData));
        baseHeader['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    return baseHeader;
}