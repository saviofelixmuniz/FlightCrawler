/**
 * @author Sávio Muniz
 */

var airport = require('../airports/airports-data').getAirport;
const moment = require('moment');
const uuidv4 = require('uuid/v4');

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
exports.formatAzulRedeemForm = formatAzulRedeemForm;
exports.formatAzulItineraryForm = formatAzulItineraryForm;
exports.formatAzulSellForm = formatAzulSellForm;
exports.formatAzulCommitForm = formatAzulCommitForm;
exports.formatAzulPaymentForm = formatAzulPaymentForm;
exports.capitilizeFirstLetter = capitilizeFirstLetter;
exports.formatAzulHeaders = formatAzulHeaders;
exports.batos = batos;
exports.formatSmilesUrl = formatSmilesUrl;
exports.formatSmilesFlightsApiUrl = formatSmilesFlightsApiUrl;
exports.countPassengers = countPassengers;

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

function formatAzulRedeemForm(params) {
    var departureDate = params.departureDate.split('-');

    var paxPriceTypes = [];

    for (var i = 0; i<params.adults; i++) {
        paxPriceTypes.push('ADT')
    }

    for (var i = 0; i<params.children; i++) {
        paxPriceTypes.push('CHD')
    }

    var redeemParams = {
        "getAvailabilityByTripRequest": {
            "AdultAmount": Number(params.adults),
            "ChildAmount": Number(params.children),
            "Device": 3,
            "GetAllLoyalties": true,
            "PointsOnly": false,
            "TripAvailabilityRequest": {
                "AvailabilityRequests": [{
                    "ArrivalStation": params.destinationAirportCode,
                    "BeginDateString": `${departureDate[0]}/${departureDate[1]}/${departureDate[2]} 16:13`,
                    "CurrencyCode": "BRL",
                    "DepartureStation": params.originAirportCode,
                    "EndDateString": `${departureDate[0]}/${departureDate[1]}/${departureDate[2]} 16:13`,
                    "FareClassControl": 1,
                    "FareTypes": ["P", "T", "R", "W"],
                    "FlightType": 5,
                    "MaximumConnectingFlights": 15,
                    "PaxCount": Number(params.adults) + (params.children ? Number(params.children) : 0),
                    "PaxPriceTypes": paxPriceTypes
                }]
            }
        }
    };

    if (params.returnDate) {
        var returnDate = params.returnDate.split('-');

        var secondLegBody = {
            "ArrivalStation": params.originAirportCode,
            "BeginDateString": `${returnDate[0]}/${returnDate[1]}/${returnDate[2]} 16:13`,
            "CurrencyCode": "BRL",
            "DepartureStation": params.destinationAirportCode,
            "EndDateString": `${returnDate[0]}/${returnDate[1]}/${returnDate[2]} 16:13`,
            "FareClassControl": 1,
            "FareTypes": ["P", "T", "R", "W"],
            "FlightType": 5,
            "MaximumConnectingFlights": 15,
            "PaxCount": Number(params.adults) + (params.children ? Number(params.children) : 0),
            "PaxPriceTypes": paxPriceTypes
        };

        redeemParams["getAvailabilityByTripRequest"]["TripAvailabilityRequest"]["AvailabilityRequests"].push(secondLegBody);
    }

    return redeemParams;
}

function formatAzulItineraryForm(data, params, resources) {
    var form = {
        "priceItineraryByKeysV3Request": {
            "BookingFlow": "1",
            "JourneysAmountLevel": []
        }
    };
    var priceItineraryRequestWithKeys = {
        PaxResidentCountry: 'BR',
        CurrencyCode: 'BRL',
        Passengers: [],
        FareTypes:["P","T","R","W"],
        PriceKeys: [],
        SSRRequests: []
    };
    if (data.going_flight_id) {
        form.priceItineraryByKeysV3Request.JourneysAmountLevel.push({
            "AmountLevel": 1,
            "JourneySellKey": resources[data.going_flight_id].JourneySellKey
        });
        priceItineraryRequestWithKeys.PriceKeys.push({
            FareSellKey: resources[data.going_flight_id].miles.id,
            JourneySellKey: resources[data.going_flight_id].JourneySellKey
        });
        priceItineraryRequestWithKeys.SSRRequests.push({FlightDesignator: resources[data.going_flight_id].FlightDesignator});
    }
    if (data.returning_flight_id) {
        form.priceItineraryByKeysV3Request.JourneysAmountLevel.push({
            "AmountLevel": 1,
            "JourneySellKey": resources[data.returning_flight_id].JourneySellKey
        });
        priceItineraryRequestWithKeys.PriceKeys.push({
            FareSellKey: resources[data.returning_flight_id].miles.id,
            JourneySellKey: resources[data.returning_flight_id].JourneySellKey
        });
        priceItineraryRequestWithKeys.SSRRequests.push({FlightDesignator: resources[data.returning_flight_id].FlightDesignator});
    }
    for (let i = 0; i < Number(params.adults); i++) {
        priceItineraryRequestWithKeys.Passengers.push({PassengerNumber: i, PaxPriceType: {PaxType: 'ADT'}})
    }
    for (let i = 0; i < Number(params.children); i++) {
        priceItineraryRequestWithKeys.Passengers.push({PassengerNumber: i, PaxPriceType: {PaxType: 'CHD'}})
    }
    form.priceItineraryByKeysV3Request["PriceItineraryRequestWithKeys"] = JSON.stringify(priceItineraryRequestWithKeys);

    return form;
}

function formatAzulSellForm(data, params, resources) {
    var sellByKeyForm = {
        sellByKeyV3Request: {
            BookingFlow: "1",
            AmountLevels: []
        }
    };
    var sellRequestWithKeys = {
        PaxCount: data.passengers.length,
        PaxResidentCountry: 'BR',
        CurrencyCode: 'BRL',
        PaxPriceTypes: [],
        SourceOrganization: data.going_flight_id ? resources[data.going_flight_id].FlightDesignator.CarrierCode :
            resources[data.returning_flight_id].FlightDesignator.CarrierCode,
        ActionStatusCode: 'NN',
        SellKeyList: []
    };
    for (var i = 0; i < Number(params.adults); i++) {
        sellRequestWithKeys.PaxPriceTypes.push({"PaxType": "ADT"})
    }
    for (var i = 0; i < Number(params.children); i++) {
        sellRequestWithKeys.PaxPriceTypes.push({"PaxType": "CHD"})
    }

    if (data.going_flight_id) {
        sellByKeyForm.sellByKeyV3Request.AmountLevels.push(1);
        sellRequestWithKeys.SellKeyList.push({
            JourneySellKey: resources[data.going_flight_id].JourneySellKey,
            FareSellKey: resources[data.going_flight_id].miles.id
        });
    }
    if (data.returning_flight_id) {
        sellByKeyForm.sellByKeyV3Request.AmountLevels.push(1);
        sellRequestWithKeys.SellKeyList.push({
            JourneySellKey: resources[data.returning_flight_id].JourneySellKey,
            FareSellKey: resources[data.returning_flight_id].miles.id
        });
    }
    sellByKeyForm.sellByKeyV3Request.SellRequestWithKeys = JSON.stringify(sellRequestWithKeys);

    return sellByKeyForm;
}

function formatAzulCommitForm(data, customerInfo, customerNumber, sessionId) {
    var bookingRequest = {
        BookingContacts: [],
        BookingPassengers: [],
        ChangeHoldDateTime: false,
        CommitAction: "0",
        CurrencyCode: "BRL",
        DistributeToContacts: false,
        DistributionOption: "0",
        PaxResidentCountry: "BR",
        ReceivedBy: "AndroidApp",
        RestrictionOverride: false,
        WaiveNameChangeFee: false
    };

    for (let i=0; i < data.passengers.length; i++) {
        bookingRequest.BookingPassengers.push({
            "DOB": data.passengers[i].birth_date,
            "Gender": data.passengers[i].gender === "M" ? "0" : "1",
            "Name": {"FirstName": data.passengers[i].name.first, "LastName": data.passengers[i].name.last},
            "Nationality": "BR",
            "PassengerNumber": i,
            "PaxPriceType": {"PaxType": data.passengers[i].type.toUpperCase()},
            "ResidentCountry": "BR",
            "State": "1",
            "WeightCategory": "0"
        });
    }

    var commit = {
        bookingHold: false
    };
    var customerContact = {
        AddressLine1: customerInfo.Address.AddressLine1,
        AddressLine2: customerInfo.Address.AddressLine2,
        AddressLine3: customerInfo.Address.AddressLine3,
        City: customerInfo.Address.City,
        CountryCode: customerInfo.Address.Country,
        CultureCode: 'pt-BR',
        CustomerNumber: customerNumber,
        DistributionOption: '0',
        EmailAddress: customerInfo.Email,
        HomePhone: customerInfo.Address.PhoneNumber,
        Name: {FirstName: customerInfo.FirstName, LastName: customerInfo.LastName},
        NotificationPreference: '1',
        PostalCode: customerInfo.Address.ZipCode,
        ProvinceState: customerInfo.Address.State,
        State: '1',
        TypeCode: 'P'
    };
    bookingRequest.BookingContacts.push(customerContact);
    commit.bookingRequest = JSON.stringify(bookingRequest);

    var sessionContext = { SecureToken: sessionId };
    commit.sessionContext = JSON.stringify(sessionContext);
    return commit;
}

function formatAzulPaymentForm(data, params, totalTax, commitResult, priceItineraryByKeys, trechos) {
    var cardExpDate = new Date(Date.UTC(Number(data.payment.card_exp_date.split('/')[1]),
        Number(data.payment.card_exp_date.split('/')[0]) - 1, 1));
    var payment = {
        addPaymentsRequest: {
            Commit: {
                Comments: [{
                    CommentText: "Criado por MobileAndroidAPP 3.0 - v3.19.4",
                    CommentType: "0"
                }, {
                    CommentText: "CYBERSOURCE ID: 56965896-e71a-410b-9f7a-94b83e8ee3dd",
                    CommentType: "0"
                }, {
                    CommentText: "Mobile CybersourceID:f7e9cc0e-68aa-44b0-9769-045a6fccea75",
                    CommentType: "0"
                }],
                CommitAction: "0",
                CurrencyCode: "BRL",
                PaxResidentCountry: "BR",
                ReceivedBy: "AndroidApp"
            },
            Device: 3,
            PayPoints: [],
            Payment: {
                AccountNumber: data.payment.card_number,
                AuthorizationStatus: "0",
                ChannelType: "4",
                CurrencyCode: "BRL",
                DCCStatus: "0",
                Expiration: `/Date(${cardExpDate.getTime()})/`,
                Installments: 1,
                PaymentFields: [
                    {
                        "FieldName": "CC::VerificationCode",
                        "FieldValue": data.payment.card_security_code
                    }, {
                        "FieldName": "CC::AccountHolderName",
                        "FieldValue": data.payment.card_name
                    }, {
                        "FieldName": "EXPDAT",
                        "FieldValue": moment(cardExpDate).format('ddd MMM DD hh:mm:ss Z YYYY')
                    }, {
                        "FieldName": "AMT",
                        "FieldValue": String(totalTax)
                    }, {
                        "FieldName": "ACCTNO",
                        "FieldValue": data.payment.card_number
                    }, {
                        "FieldName": "NPARC",
                        "FieldValue": "1"
                    }, {
                        "FieldName": "CPF",
                        "FieldValue": data.payment.cpf
                    }
                ],
                "PaymentMethodCode": data.payment.card_brand_code,
                "PaymentMethodType": "1",
                "PaymentText": "-",
                "QuotedAmount": totalTax,
                "QuotedCurrencyCode": "BRL",
                "ReferenceType": "0",
                "Status": "0",
                "Transferred": false,
                "WaiveFee": false
            },
            "RecordLocator": commitResult.RecordLocator,
            "SegmentSeatRequest": []
        }
    };

    for (var itinerary of priceItineraryByKeys.PriceItineraryByKeysV3Result.JourneysItineraryPriceId) {
        var flight = getFlightBySellKey(itinerary.JourneySellKey, trechos);
        var fare;
        for (var f of flight.Milhas) {
            fare = f;
            break;
        }
        var flightInfo = {
            AmountLevel: 1,
            ArrivalStation: flight.Destino,
            DepartureStation: flight.Origem,
            FareSellKey: fare.FareSellKey,
            ItineraryPriceId: itinerary.ItineraryPriceId,
            JourneySellKey: itinerary.JourneySellKey,
            PaxPointsPaxesTypes: [
                {
                    Amount: 0,
                    PaxCount: countPassengers(data.passengers, 'ADT'),
                    PaxType: 'ADT',
                    Points: fare.Adulto
                }
            ],
            TransactionId: uuidv4()
        };
        if (countPassengers(data.passengers, 'CHD')) {
            flightInfo.PaxPointsPaxesTypes.push({
                Amount: 0,
                PaxCount: countPassengers(data.passengers, 'CHD'),
                PaxType: 'CHD',
                Points: fare.Crianca
            });
        }
        payment.addPaymentsRequest.PayPoints.push(flightInfo);
    }

    return payment;
}

function getFlightBySellKey(journeyKey, stretches) {
    for (var stretch in stretches) {
        for (var flight of stretches[stretch].Voos) {
            if (flight.company_id === journeyKey) return flight;
        }
    }

    return null;
}

function countPassengers(passengers, type) {
    if (!type) return passengers.length;

    var count = 0;
    for (var passenger of passengers) {
        if (passenger.type.toUpperCase() === type.toUpperCase()) count++;
    }
    return count;
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
