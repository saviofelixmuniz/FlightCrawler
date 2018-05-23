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

function urlFormat(root, path, params) {
    const myURL = new URL(path, root);
    Object.keys(params).forEach(function (param) {
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
    return JSON.parse(response.body.split('config : ')[1].split('});')[0].split(', pageEngine')[0]);
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
            ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD:0,
            ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT:0
        };
    else
        return {'__EVENTTARGET': 'ControlGroupSearch$LinkButtonSubmit',
                '__EVENTARGUMENT': '',
                '__VIEWSTATE': '/wEPDwUBMGRk8HVTGURCOI8ogJjuxnKVJYjGv9I=',
                'pageToken': '',
                '_authkey_': '',
                'loginDomain': 'AZUL_LOGIN',
                'NavigationHeaderInputFlightSearchView$MemberLoginFlightSearchView$TextBoxUserID': '',
                'NavigationHeaderInputFlightSearchView$MemberLoginFlightSearchView$PasswordFieldPassword': '',
                'ControlGroupSearch$SearchMainSearchView$RadioButtonMarketStructure': 'OneWay',
                'ControlGroupSearch$SearchMainSearchView$TextBoxMarketOrigin1': `(${params.originAirportCode})`,
                'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacOrigin1': '',
                'hdfSearchCodeDeparture1': '1N',
                'ControlGroupSearch$SearchMainSearchView$TextBoxMarketDestination1': `(${params.destinationAirportCode})`,
                'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacDestination1': '',
                'hdfSearchCodeArrival1': '1N',
                'departure1': '07/06/2018',
                'ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay1': `${params.departureDate.split('-')[2]}`,
                'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth1': `${params.departureDate.split('-')[0]}-${params.departureDate.split('-')[1]}`,
                'arrival': '',
                'ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay2': '',
                'ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth2': '',
                'origin2': '',
                'ControlGroupSearch$SearchMainSearchView$TextBoxMarketOrigin2': '',
                'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacOrigin2': '',
                'hdfSearchCodeDeparture2': '',
                'destination2': '',
                'ControlGroupSearch$SearchMainSearchView$TextBoxMarketDestination2': '',
                'ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacDestination2': '',
                'hdfSearchCodeArrival2': '',
                'departure2': '',
                'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_ADT': `${params.adults || 1}`,
                'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD': '0',
                'ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT': '0',
                'faretypes': 'R',
                'ControlGroupSearch$SearchMainSearchView$DropDownListSearchBy': 'columnView',
                'ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes': 'R',
                'searchTypeMyReservation':
                'booking-code',
                'pnr': '',
                'lastName': '',
                'username': '',
                'password': '',
                'useLastName': 'false',
                'origin-depbutton-0003 skin-0008 text--0001 ps-right ps-bottomarture': '',
                'departure': '',
                'destination-arrival': '',
                'date': '',
                'value': '',
                'origin': '',
                'from': '',
                'destination': '',
                'to': '',
                'flightNumber': ''
    }
}

function responseFormat(jsonRedeemResponse, jsonCashResponse, searchParams, company, cookieJar) {
    return formatters[company](jsonRedeemResponse, jsonCashResponse, searchParams, cookieJar);
}