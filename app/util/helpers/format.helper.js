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
exports.batos = batos;
exports.formatSmilesUrl = formatSmilesUrl;
exports.formatSmilesFlightsApiUrl = formatSmilesFlightsApiUrl;

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

function responseFormat(jsonRedeemResponse, jsonCashResponse, confiancaResponse, searchParams, company, cookieJar) {
    return formatters[company](jsonRedeemResponse, jsonCashResponse, confiancaResponse, searchParams, cookieJar);
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

function formatSmilesUrl(params, forceCongener=false) {
    return `https://www.smiles.com.br/emissao-com-milhas?tripType=${params.returnDate ? '1' : '2'}&originAirport=${params.originAirportCode}&
            destinationAirport=${params.destinationAirportCode}&departureDate=${getGolTimestamp(params.departureDate)}&
            returnDate=${params.returnDate ? getGolTimestamp(params.returnDate) : ''}&adults=${params.adults}&
            children=${params.children}&infants=0&searchType=both&segments=1&isElegible=false&originCity=&forceCongener=${forceCongener}&
            originCountry=&destinCity=&destinCountry=&originAirportIsAny=true&destinationAirportIsAny=false`.replace(/\s+/g, '');
}

function getGolTimestamp(stringDate) {
    return new Date(stringDate + 'T13:00:00+00:00').getTime();
}

function formatSmilesFlightsApiUrl(params, forceCongener=false) {
    return `https://flightavailability-prd.smiles.com.br/searchflights?adults=${params.adults}&children=${params.children}&
            departureDate=${params.departureDate}${params.returnDate ? '&returnDate=' + params.returnDate : ''}&destinationAirportCode=${params.destinationAirportCode}&
            forceCongener=${forceCongener}&infants=0&memberNumber=&originAirportCode=${params.originAirportCode}`.replace(/\s+/g, '');
}