/**
 * @author Anderson Menezes
 */
module.exports = {
    issueTicket: issueTicket
};

const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
const MESSAGES = require('../util/helpers/messages');
const Requester = require ('../util/services/requester');
const Keys = require ('../configs/keys');
const adyenEncrypt = require('node-adyen-encrypt');
const Time = require('../util/helpers/time-utils');
const request = require('request-promise');
const Properties = require('../db/models/properties');

async function issueTicket(req, res, next) {
    var pSession = Requester.createSession('gol');
    var data = req.body;

    var requested = await db.getRequest(data.request_id);

    var headers = {};
    headers['User-Agent'] = 'Smiles/2.53.0/21530 (unknown Android SDK built for x86; Android 7.1.1) OkHttp';
    headers['http.useragent'] = 'Smiles/2.53.0/21530 (unknown Android SDK built for x86; Android 7.1.1) OkHttp';
    headers['x-api-key'] = Keys.smilesApiKey;
    headers['Channel'] = 'APP';

    if (!requested) {
        Requester.killSession(pSession);
        res.status(404);
        res.json();
        return;
    }

    var emission = await db.createEmissionReport(data.request_id, 'gol', data);
    delete emission.data;
    res.json(emission);

    var params = requested.params;

    try {
        var tokenRes = await Requester.require({
            session: pSession,
            request: {
                url: 'https://api.smiles.com.br/api/oauth/token',
                form: {
                    grant_type: 'client_credentials',
                    client_id: '827160d9-0261-415f-993d-e47fd03f8ea5',
                    client_secret: 'fabedc42-c0fd-4d44-aef8-3e7dc2719b08'
                },
                json: true
            },
        });
        if (!tokenRes || !tokenRes.access_token) {
            Requester.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 1, 'Couldn\'t login', tokenRes, true);
            return;
        }
        headers.Authorization = 'Bearer ' + tokenRes.access_token;
        await db.updateEmissionReport('gol', emission._id, 1, null, null);

        var loginRes = await Requester.require({
            session: pSession,
            request: {
                headers: headers,
                url: 'https://api.smiles.com.br/smiles/login',
                json: {
                    id: data.credentials.cpf ? data.credentials.cpf : data.credentials.login,
                    password: data.credentials.password
                }
            }
        });
        if (!loginRes || !loginRes.token) {
            if (data.credentials.cpf && data.credentials.login) {
                loginRes = await Requester.require({
                    session: pSession,
                    request: {
                        headers: headers,
                        url: 'https://api.smiles.com.br/smiles/login',
                        json: {
                            id: data.credentials.login,
                            password: data.credentials.password
                        }
                    }
                });

                if (!loginRes || !loginRes.token) {
                    Requester.killSession(pSession);
                    db.updateEmissionReport('gol', emission._id, 2, 'Couldn\'t login', loginRes, true);
                    return;
                }
            }

            if (!loginRes || !loginRes.token) {
                Requester.killSession(pSession);
                db.updateEmissionReport('gol', emission._id, 2, 'Couldn\'t login', loginRes, true);
                return;
            }
        }

        headers.Authorization = 'Bearer ' + loginRes.token;
        await db.updateEmissionReport('gol', emission._id, 2, null, null);

        var memberRes = await Requester.require({
            session: pSession,
            request: {
                headers: headers,
                url: 'https://api.smiles.com.br/smiles-bus/MemberRESTV1/GetMember',
                json: {
                    memberNumber: loginRes.memberNumber,
                    token: loginRes.token
                }
            }
        });
        if (!memberRes || !memberRes.member) {
            Requester.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 3, 'Couldn\'t get member', memberRes, true);
            return;
        }
        await db.updateEmissionReport('gol', emission._id, 3, null, null);

        var searchUrl = formatSearchUrl(params, data);
        var strackidRes = await request({
            url: `http://ec2-35-172-117-157.compute-1.amazonaws.com:8082/api/strackid?url=${encodeURIComponent(searchUrl)}&authorization=${loginRes.token}`,
            json: true
        });

        if (!strackidRes || !strackidRes.strackid) {
            Requester.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 4, 'Couldn\'t get strackid', strackidRes, true);
            return;
        }
        headers['x-strackid'] = strackidRes.strackid;
        var searchRes = await Requester.require({
            session: pSession,
            request: {
                method: 'GET',
                url: searchUrl,
                headers: headers,
                json: true
            }
        });

        if (!searchRes || !searchRes.requestedFlightSegmentList) {
            db.updateEmissionReport('gol', emission._id, 4, "Couldn't get flights.", searchRes, true);
            return;
        }

        var fareList = [];
        if (data.going_flight_id) {
            var goingFlightAndPrice = getSmilesFlightByConnections(getFlightById(data.going_flight_id, requested.response.Trechos),
                searchRes.requestedFlightSegmentList, memberRes.member.category.toUpperCase() === 'DIAMANTE' || memberRes.member.isClubMember);
            var goingFlight = goingFlightAndPrice ? goingFlightAndPrice.flight : null;
            var goingPrice = goingFlightAndPrice ? goingFlightAndPrice.price : null;
            if (!goingFlight) {
                db.updateEmissionReport('gol', emission._id, 4, goingFlightAndPrice ? "Price of flight got higher." : "Unavailable flight.", null, true);
                return;
            }
            var goingFare = getFare(goingFlight.fareList);
            fareList.push(goingFare);
        }
        if (data.returning_flight_id) {
            var returningFlightAndPrice = getSmilesFlightByConnections(getFlightById(data.returning_flight_id, requested.response.Trechos),
                searchRes.requestedFlightSegmentList, memberRes.member.category.toUpperCase() === 'DIAMANTE' || memberRes.member.isClubMember);
            var returningFlight = returningFlightAndPrice ? returningFlightAndPrice.flight : null;
            var returningPrice = returningFlightAndPrice ? returningFlightAndPrice.price : null;
            if (!returningFlight) {
                db.updateEmissionReport('gol', emission._id, 4, returningFlightAndPrice ? "Price of flight got higher." : "Unavailable flight.", null, true);
                return;
            }
            var returningFare = getFare(returningFlight.fareList);
            fareList.push(returningFare);
        }

        var priceInfo = {};
        if (data.going_flight_id && goingPrice) priceInfo.going = goingPrice;
        if (data.returning_flight_id && returningPrice) priceInfo.returning = returningPrice;
        await db.updateEmissionReport('gol', emission._id, 4, null, null, false, {priceInfo: priceInfo});

        var taxUrl = `https://flightavailability-prd.smiles.com.br/getboardingtax?type=SEGMENT_1&uid=${data.going_flight_id ? goingFlight.uid : returningFlight.uid}` +
            `&fareuid=${data.going_flight_id ? goingFare.uid : returningFare.uid}` +
            `&adults=${Formatter.countPassengers(data.passengers, 'ADT')}&children=${Formatter.countPassengers(data.passengers, 'CHD')}&infants=0`;
        if (data.going_flight_id && data.returning_flight_id)
            taxUrl += `&type2=SEGMENT_2&fareuid2=${returningFare.uid}&uid2=${returningFlight.uid}`;

        var taxRes = await Requester.require({
            session: pSession,
            request: {
                method: 'GET',
                url: taxUrl,
                headers: headers,
                json: true
            }
        });
        if (!taxRes || taxRes.errorMessage || !taxRes.flightList) {
            Requester.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 5, 'Couldn\'t get taxes', taxRes, true);
            return;
        }
        await db.updateEmissionReport('gol', emission._id, 5, null, null, false, {priceInfo: priceInfo});

        var booking = formatSmilesCheckoutForm(data, taxRes.flightList, loginRes.memberNumber, null, params, fareList);
        var checkoutRes = await Requester.require({
            session: pSession,
            request: {
                headers: headers,
                url: 'https://api.smiles.com.br/api/checkout',
                json: booking
            }
        });

        if (!checkoutRes || !checkoutRes.itemList) {
            Requester.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 6, 'Couldn\'t checkout', checkoutRes, true);
            return;
        }
        await db.updateEmissionReport('gol', emission._id, 6, null, null, false, {priceInfo: priceInfo});

        var passengersForm = formatSmilesPassengersForm(data.passengers, checkoutRes.itemList[0].fee ? checkoutRes.itemList[1].id : checkoutRes.itemList[0].id);
        var passengersRes = await Requester.require({
            session: pSession,
            request: {
                headers: headers,
                url: 'https://api.smiles.com.br/api/checkout/passengers',
                json: passengersForm
            }
        });

        if (!passengersRes || passengersRes.errorCode) {
            Requester.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 7, 'Couldn\'t set passengers', passengersRes, true);
            return;
        }
        await db.updateEmissionReport('gol', emission._id, 7, null, null, false, {priceInfo: priceInfo});

        headers['API_VERSION'] = '2';
        var getCheckoutRes = await Requester.require({
            session: pSession,
            request: {
                headers: headers,
                url: 'https://api.smiles.com.br/api/checkout',
                json: true,
                method: 'GET'
            }
        });

        if (!getCheckoutRes || !getCheckoutRes.totals) {
            Requester.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 8, 'Couldn\'t get checkout info', getCheckoutRes, true);
            return;
        }
        await db.updateEmissionReport('gol', emission._id, 8, null, null, false, {priceInfo: priceInfo});

        var savedCard = findCard(data.payment, getCheckoutRes.savedCardList);

        var reservationRes = await Requester.require({
            session: pSession,
            request: {
                headers: headers,
                url: 'https://api.smiles.com.br/api/credits/reservation'
            }
        });

        var encryptedCard = null;
        var cardTokenRes = null;
        if (!savedCard) {
            var cardData = {
                number: data.payment.card_number,
                cvc: data.payment.card_security_code,
                holderName: data.payment.card_name,
                expiryMonth: data.payment.card_exp_date.split('/')[0],
                expiryYear: data.payment.card_exp_date.split('/')[1],
                generationtime: new Date().toISOString()
            };

            var cseInstance = adyenEncrypt.createEncryption(Keys.smilesEncryptionKey, {numberIgnoreNonNumeric: true});
            encryptedCard = cseInstance.encrypt(cardData);

            var shopperName = encodeURIComponent(memberRes.member.firstName + ' ' + memberRes.member.lastName);
            var number = encodeURIComponent(Buffer.from(data.payment.card_number).toString('base64')) + '%0A';
            var holder = encodeURIComponent(data.payment.card_name);
            var expirationDate = data.payment.card_exp_date;
            var brand = getSmilesCardBrandByCode(data.payment.card_brand_code);
            var bin = data.payment.card_number.substring(0, 5);
            var cardTokenUrl = `https://api.smiles.com.br/api/card/token?shopperName=${shopperName}` +
                `&number=${number}&holder=${holder}` +
                `&expirationDate=${expirationDate}&brand=${brand}` +
                `&bin=${bin}&isOneClick=false`;
            cardTokenRes = await Requester.require({
                session: pSession,
                request: {
                    headers: headers,
                    url: cardTokenUrl,
                    json: true,
                    method: 'GET'
                }
            });

            if (!cardTokenRes || !cardTokenRes.bin) {
                Requester.killSession(pSession);
                db.updateEmissionReport('gol', emission._id, 9, 'Couldn\'t get credit card token', cardTokenRes, true);
                return;
            }
            await db.updateEmissionReport('gol', emission._id, 9, null, null, false, {priceInfo: priceInfo});
        }

        var orderForm = formatSmilesOrderForm(checkoutRes.itemList, cardTokenRes, encryptedCard, loginRes.memberNumber, data, savedCard);
        var orderRes = await Requester.require({
            session: pSession,
            request: {
                headers: headers,
                url: 'https://api.smiles.com.br/api/orders',
                json: orderForm
            }
        });

        if (!orderRes || !orderRes.orderId) {
            Requester.killSession(pSession);
            db.updateEmissionReport('gol', emission._id, 10, 'Couldn\'t place order and pay', orderRes, true);
            return;
        }
        await db.updateEmissionReport('gol', emission._id, 10, null, orderRes, false, {orderId: orderRes.orderId, priceInfo: priceInfo});


        var today = new Date();
        var lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 10);

        var tries = 0;
        while (true) {
            var getOrderRes = await Requester.require({
                session: pSession,
                request: {
                    headers: headers,
                    url: `https://api.smiles.com.br/api/orders?orderId=${orderRes.orderId}&beginDate=${Time.formatDateReverse(lastWeek)}&endDate=${Time.formatDateReverse(today)}`,
                    json: true,
                    method: 'GET'
                }
            });

            if (!getOrderRes || !getOrderRes.orderList || (getOrderRes.orderList[0].status !== 'PROCESSED' &&
                getOrderRes.orderList[0].status !== 'IN_PROGRESS') || tries > 5) {
                Requester.killSession(pSession);
                db.updateEmissionReport('gol', emission._id, 11, 'Couldn\'t get locator', getOrderRes, true, {orderId: orderRes.orderId});
                return;
            }
            if ((getOrderRes.orderList[0].status === 'PROCESSED' || getOrderRes.orderList[0].status === 'IN_PROGRESS')) {
                var recordLocator = null;
                var booking = null;

                if (getOrderRes.orderList[0].itemList && getOrderRes.orderList[0].itemList.length > 0) {
                    if (getOrderRes.orderList[0].itemList[0].booking) booking = getOrderRes.orderList[0].itemList[0].booking;
                    else if (getOrderRes.orderList[0].itemList[1].booking) booking = getOrderRes.orderList[0].itemList[1].booking;
                }

                recordLocator = booking.flight.chosenFlightSegmentList[0].recordLocator;
                if (recordLocator) {
                    db.updateEmissionReport('gol', emission._id, 12, null, getOrderRes, true, {locator: recordLocator, orderId: orderRes.orderId, priceInfo: priceInfo});
                    return;
                }
            }
            tries++;
            await sleep(4000);
        }
    } catch (err) {
        Requester.killSession(pSession);
        db.updateEmissionReport('gol', emission._id, null, err.stack, null, true);
    }
}

function findCard(payment, cardList) {
    if (!cardList) return null;
    for (var savedCard of cardList) {
        if (payment.card_name === savedCard.holderName && payment.card_number.substring(0, 6) === savedCard.bin
            && payment.card_number.substring(payment.card_number.length - 4, payment.card_number.length)) {
            return savedCard;
        }
    }

    return null;
}

function formatSmilesCheckoutForm(data, flightList, memberNumber, id, params, fareList) {
    var checkout = {
        booking: {
            flight: {
                adults: Formatter.countPassengers(data.passengers, 'ADT'),
                children: Formatter.countPassengers(data.passengers, 'CHD'),
                infants: Formatter.countPassengers(data.passengers, 'INF'),
                currencyCode: 'BRL',
                chooseFlightSegmentList: []
            }
        },
        memberNumber: memberNumber
    };
    if (id) checkout.id = id;
    checkout.booking.flight.chooseFlightSegmentList.push({
        chooseFlight: {
            chooseBoardingTax: {
                selectedOption: 'money'
            },
            chooseFare: {
                uid: fareList[0].uid
            },
            conversionRate: 0,
            uid: flightList[0].uid
        },
        type: 'SEGMENT_1'
    });
    if (!(data.going_flight_id && data.returning_flight_id)) {
        checkout.booking.routeList = [{
            departureDate: flightList[0].departure.date,
            destinationAirportCode: flightList[0].arrival.airport.code,
            originAirportCode: flightList[0].departure.airport.code,
        }];
    } else {
        checkout.booking.roundTrip = {
            departureDate: flightList[0].departure.date.substring(0, flightList[0].departure.date.indexOf('T')) + 'T00:00:00',
            destinationAirportCode: params.destinationAirportCode,
            originAirportCode: params.originAirportCode,
            returnDate: flightList[1].departure.date.substring(0, flightList[1].departure.date.indexOf('T')) + 'T00:00:00',
        };
        checkout.booking.flight.chooseFlightSegmentList.push({
            chooseFlight: {
                chooseBoardingTax: {
                    selectedOption: 'money'
                },
                chooseFare: {
                    uid: fareList[1].uid
                },
                conversionRate: 0,
                uid: flightList[1].uid
            },
            type: 'SEGMENT_2'
        });
    }
    return checkout;
}

function formatSmilesPassengersForm(passengers, checkoutId) {
    var passengersForm = {
        id: checkoutId,
        passengerList: []
    };
    var i = 0;

    for (let passenger of passengers) {
        var birthday = passenger.birth_date.split('T')[0].length <= 10 ? passenger.birth_date.split('T')[0] : passenger.birth_date.split(' ')[0];
        passengersForm.passengerList.push({
            requestSpecialServicesList: [],
            birthday: birthday,
            email: passenger.email,
            firstName: passenger.name.first,
            gender: passenger.gender.toUpperCase() === 'M' ? 'MALE' : 'FEMALE',
            index: String(i),
            lastName: passenger.name.last,
            redressNumber: '',
            type: passenger.type.toUpperCase()
        });
        i++;
    }
    return passengersForm;
}

function formatSmilesOrderForm(itemList, cardInfo, encryptedCard, memberNumber, data, savedCard) {
    if (savedCard) {
        var card = {
            bin: savedCard.bin,
            expirationDate: savedCard.expirationDate,
            holderName: savedCard.holderName,
            sufixNumber: savedCard.number,
            brand: savedCard.brand,
            cardToken: savedCard.tokenAux,
            securityCode: data.payment.card_security_code,
            requestStatus: 200,
            cardIdentifier: savedCard.token
        };
    } else {
        var card = {
            bin: cardInfo.bin,
            expirationDate: cardInfo.expirationDate,
            holderName: cardInfo.holderName,
            sufixNumber: cardInfo.sufixNumber,
            brand: getSmilesCardBrandByCode(data.payment.card_brand_code),
            cardToken: cardInfo.cardToken,
            encryptedInfo: encryptedCard,
            isPrimary: true,
            saveCard: false,
            securityCode: data.payment.card_security_code,
            requestStatus: 200
        }
    }
    var orderForm = {
        itemList: [],
        memberNumber: memberNumber,
        paymentData: {
            creditCard: card,
            installments: 1,
            verificationCode: data.credentials.password
        }
    };
    for (let i=0; i < itemList.length; i++) {
        if (itemList[i].fee) {
            orderForm.itemList.push({
                fee: {
                    miles: Number(itemList[i].fee.miles),
                    money: Number(itemList[i].fee.money),
                    subType: '',
                    type: itemList[i].fee.type
                },
                id: itemList[i].id
            });
        } else {
            var item = {
                booking: {
                    flight: {
                        adults: Number(itemList[i].booking.flight.adults),
                        children: Number(itemList[i].booking.flight.children),
                        chooseFlightSegmentList: [],
                        currencyCode: 'BRL',
                        infants: Number(itemList[i].booking.flight.infants)
                    }
                },
                id: itemList[i].id
            };
            for (var segment of itemList[i].booking.flight.chosenFlightSegmentList) {
                item.booking.flight.chooseFlightSegmentList.push({
                    chooseFlight: {
                        chooseBoardingTax: {selectedOption: 'money'},
                        chooseFare: {uid: segment.chosenFlight.chosenFare.uid},
                        conversionRate: 0.0,
                        uid: segment.chosenFlight.uid
                    },
                    type: segment.type
                })
            }
            orderForm.itemList.push(item);
        }
    }
    return orderForm;
}

function getSmilesFlightByConnections(flight, smilesSegments, isDiamond) {
    for (let smilesFlight of smilesSegments[flight["Sentido"] === 'ida' ? 0 : 1].flightList) {
        if (compareConnections(flight, smilesFlight)) {
            console.log('Achou voo');
            var fare = getFare(isDiamond ? smilesFlight.fareTierList : smilesFlight.fareList, isDiamond);
            if (flight.Milhas[0].Adulto >= fare.miles) {
                return { flight: smilesFlight, price: fare.miles };
            }
            else break;
        }
    }

    return null;
}

function getFare(fareList, isDiamond) {
    var fareResult = null;

    for (let fare of fareList) {
        if (fare.money === 0) {
            if (fareResult) {
                if (fare.miles > fareResult.miles && !isDiamond) {
                    fareResult = fare;
                } else if (fare.miles <= fareResult.miles && isDiamond) {
                    fareResult = fare;
                }
            } else {
                fareResult = fare;
            }
        }
    }

    return fareResult;
}

function getFlightNumber(number) {
    var n = number;
    if (number.split(' ').length > 1) {
        n = number.split(' ')[1];
    }
    if (number.split('-').length > 1) {
        n = number.split('-')[1];
    }

    var result = '';
    for (let c of n) {
        if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].indexOf(c) >= 0) {
            result += c;
        }
    }

    return result;
}

function compareConnections(flight, smilesFlight) {
    var flightKey = getFlightKey(flight);
    var sFlightKey = getFlightKey(smilesFlight);
    if (flightKey === sFlightKey) {
        return true;
    }

    return false;
}

function getFlightKey(flight) {
    var flightKey = '';
    if (flight._id) {
        if (flight["Conexoes"].length === 0) {
            flightKey += '~' + flight["Origem"] + ' ';
            flightKey += getFlightNumber(flight["NumeroVoo"]) + ' ';
            flightKey += flight["Embarque"];
        } else {
            for (let connection of flight["Conexoes"]) {
                flightKey += '~' + connection["Origem"] + ' ';
                flightKey += getFlightNumber(connection["NumeroVoo"]) + ' ';
                flightKey += connection["Embarque"];
            }
        }
    } else {
        for (let connection of flight["legList"]) {
            flightKey += '~' + connection.departure.airport.code + ' ';
            flightKey += getFlightNumber(connection.flightNumber) + ' ';
            flightKey += Time.getDateTime(new Date(connection["departure"]["date"]));
        }
    }

    return flightKey;
}

function getFlightById(id, stretches) {
    for (var stretch in stretches) {
        for (var flight of stretches[stretch].Voos) {
            if (flight._id.toString() === id) return flight;
        }
    }
    return null;
}

function getSmilesFlightBySellKey(flight, segments) {
    for (let segment of segments) {
        for (let sFlight of segment.flightList) {
            var fare = getFare(sFlight.fareList);
            if (flight.sellKey === sFlight.sellKey && flight.Milhas[0].Adulto >= fare.miles) {
                return sFlight;
            }
        }
    }

    return null;
}

function getSmilesCardBrandByCode(code) {
    if (code.toUpperCase() === 'MC') {
        return 'MASTERCARD';
    }
    if (code.toUpperCase() === 'VI') {
        return 'VISA';
    }
    if (code.toUpperCase() === 'DI') {
        return 'DINERS_CLUB';
    }
    if (code.toUpperCase() === 'AX') {
        return 'AMEX';
    }
    if (code.toUpperCase() === 'EL') {
        return 'ELO';
    }
    if (code.toUpperCase() === 'HP') {
        return 'HIPERCARD';
    }
    if (code.toUpperCase() === 'DC') {
        return 'DISCOVER';
    }
}

function formatSearchUrl(params, data) {
    return `https://flightavailability-prd.smiles.com.br/searchflights?adults=${Formatter.countPassengers(data.passengers, 'ADT')}
            &children=${Formatter.countPassengers(data.passengers, 'CHD')}&
            departureDate=${getDepartureDate(params, data)}${(data.going_flight_id && data.returning_flight_id) ? '&returnDate=' + getReturnDate(params, data) : ''}
            &destinationAirportCode=${params.destinationAirportCode}&
            forceCongener=false&infants=${Formatter.countPassengers(data.passengers, 'INF')}&memberNumber=&originAirportCode=${params.originAirportCode}`.replace(/\s+/g, '');
}

function getDepartureDate(params, data) {
    if (data.returning_flight_id && !data.going_flight_id) return params.returnDate;

    return params.departureDate;
}

function getReturnDate(params, data) {
    if (data.returning_flight_id && data.going_flight_id) return params.returnDate;

    return '';

}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
