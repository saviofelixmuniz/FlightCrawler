/**
 * @author Sávio Muniz
 */

var airportLabel = require('./airport-labels').getAirportLabel;

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
    if (!oneWay)
        return {
        'ControlGroupSearch$SearchMainSearchView$TextBoxPromoCode': 'CALLCENT',
        'culture': 'pt-BR',
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay1': `${params.departureDate.split('-')[2]}`,
        'departure1': `${params.departureDate.split('-')[2]}/${params.departureDate.split('-')[1]}/${params.departureDate.split('-')[0]}`,
        'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacDestination1': '',
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT': '0',
        'originIata1': `${params.originAirportCode}`,
        'origin1': `${airportLabel(params.originAirportCode)} (${params.originAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$TextBoxMarketOrigin1': `${airportLabel(params.originAirportCode)} (${params.originAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$TextBoxMarketDestination1': `${airportLabel(params.destinationAirportCode)} (${params.destinationAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacOrigin1': 'on',
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth1': `${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
        'ControlGroupSearch$SearchMainSearchView$RadioButtonMarketStructure': 'RoundTrip',
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth2': `${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_ADT': `${params.adults || 1}`,
        'arrival': `${params.returnDate.split('-')[2]}/${params.returnDate.split('-')[1]}/${params.returnDate.split('-')[0]}`,
        'destinationIata1': `${params.destinationAirportCode}`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes': 'R',
        '__EVENTTARGET': 'ControlGroupSearch$LinkButtonSubmit',
        'destination1': `${airportLabel(params.destinationAirportCode)} (${params.destinationAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay2': `${params.returnDate.split('-')[2]}`,
        'hdfSearchCodeDeparture1': '1N',
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD': `${params.children}`,
        'hdfSearchCodeArrival1': '1N',
        'ControlGroupSearch$SearchMainSearchView$DropDownListSearchBy': 'columnView'};
    else
        return {
        'ControlGroupSearch$SearchMainSearchView$TextBoxPromoCode': 'CALLCENT',
        'culture': 'pt-BR',
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD': `${params.children}`,
        'departure1': `${params.departureDate.split('-')[2]}/${params.departureDate.split('-')[1]}/${params.departureDate.split('-')[0]}`,
        'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacDestination1': '',
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT': '0',
        'originIata1': `${params.originAirportCode}`,
        'origin1': `${airportLabel(params.originAirportCode)} (${params.originAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$TextBoxMarketOrigin1': `${airportLabel(params.originAirportCode)} (${params.originAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$TextBoxMarketDestination1': `${airportLabel(params.destinationAirportCode)} (${params.destinationAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacOrigin1': 'on',
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth1': `${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
        'ControlGroupSearch$SearchMainSearchView$RadioButtonMarketStructure': 'OneWay',
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_ADT': `${params.adults}`,
        'destinationIata1': `${params.destinationAirportCode}`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes': 'R',
        '__EVENTTARGET': 'ControlGroupSearch$LinkButtonSubmit',
        'destination1': `${airportLabel(params.destinationAirportCode)} (${params.destinationAirportCode})`,
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