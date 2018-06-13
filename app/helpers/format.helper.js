/**
 * @author Sávio Muniz
 */

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
            _authkey_:'106352422A4DEB0810953636A6FBE2079955529786098DE8B0D32416202E380E34C245FA99C431C7C7A75560FDE65150',
            __EVENTTARGET:'ControlGroupSearch$LinkButtonSubmit',
            ControlGroupSearch$SearchMainSearchView$DropDownListSearchBy:'columnView',
            culture:'pt-BR',
            ControlGroupSearch$SearchMainSearchView$TextBoxPromoCode:'CALLCENT',
            ControlGroupSearch$SearchMainSearchView$RadioButtonMarketStructure: oneWay ? 'OneWay' : 'RoundTrip',
            origin1:'',
            ControlGroupSearch$SearchMainSearchView$TextBoxMarketOrigin1:`(${params.originAirportCode})`,
            ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacOrigin1:'',
            hdfSearchCodeDeparture1:'1N',
            originIata1:'',
            destination1:'',
            ControlGroupSearch$SearchMainSearchView$TextBoxMarketDestination1:`(${params.destinationAirportCode})`,
            ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacDestination1:'on',
            hdfSearchCodeArrival1:'1N',
            destinationIata1:'',
            departure1:'',
            ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay1:`${params.departureDate.split('-')[2]}`,
            ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth1:`${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
            arrival:'',
            ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay2: oneWay ? undefined : `${params.returnDate.split('-')[2]}`,
            ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth2:oneWay ? undefined : `${params.returnDate.split('-')[0]}-${params.returnDate.split('-')[1]}`,
            originIata2:'',
            destinationIata2:'',
            ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_ADT:`${params.adults || 1}`,
            ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD: params.children,
            ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT:0
        };
    else
        return {
        '__EVENTTARGET': 'ControlGroupSearch$LinkButtonSubmit',
        'ControlGroupSearch$SearchMainSearchView$DropDownListSearchBy': 'columnView',
        'culture': 'pt-BR',
        'ControlGroupSearch$SearchMainSearchView$TextBoxPromoCode': 'CALLCENT',
        'ControlGroupSearch$SearchMainSearchView$RadioButtonMarketStructure': 'OneWay',
        'origin1': `(${params.originAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$TextBoxMarketOrigin1': `(${params.originAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacOrigin1': 'on',
        'hdfSearchCodeDeparture1': '1N',
        'originIata1': `${params.originAirportCode}`,
        'destination1': `(${params.destinationAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$TextBoxMarketDestination1': `(${params.destinationAirportCode})`,
        'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacDestination1': 'on',
        'hdfSearchCodeArrival1': '1N',
        'destinationIata1': `${params.destinationAirportCode}`,
        'departure1': `${params.departureDate.split('-')[2]}/${params.departureDate.split('-')[1]}/${params.departureDate.split('-')[0]}`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay1': `${params.departureDate.split('-')[2]}`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth1': `${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_ADT': `${params.adults || 1}`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD': `${params.children}`,
        'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT': '0',
        'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes': 'R'
    }
}

function responseFormat(jsonRedeemResponse, jsonCashResponse, searchParams, company, cookieJar) {
    return formatters[company](jsonRedeemResponse, jsonCashResponse, searchParams, cookieJar);
}

function capitilizeFirstLetter(string) {
    return string[0].toUpperCase() + string.slice(1);
}