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
const ECONOMIC_PRODUCT_CLASS = ["AY", "TE", "TP"];

async function issueTicket(req, res, next) {
    var pSession = Requester.createSession('azul');
    var data = req.body;
    var requested = await db.getRequest(data.request_id);
    var resources = await db.getRequestResources(data.request_id);
    resources = resources.resources;
    if (!requested || !resources) {
        Requester.killSession(pSession);
        res.status(404);
        res.json();
        return;
    }
    var emission = await db.createEmissionReport(data.request_id, 'azul', data);
    delete emission.data;
    res.json(emission);

    var params = requested.params;
    const request = require("request-promise");
    var cookieJar = request.jar();
    var credentials = {
        "AgentName": data.credentials.cpf ? data.credentials.cpf : data.credentials.login,
        "Password": data.credentials.password,
        "Device": 3
    };
    // Default login to get session
    Requester.require({
        session: pSession,
        request: {url: 'https://webservices.voeazul.com.br/TudoAzulMobile/SessionManager.svc/Logon',
            headers: { 'Content-Type': 'application/json' },
            json: { 'AgentName': 'mobileadruser', 'Password': 'Azul2AdrM', 'DomainCode': 'EXT' },
            jar: cookieJar
        }
    }).then(async function (body) {
        var sessionId = body.SessionID;
        var session = '';
        for (var i = 0; i < sessionId.length; i++){
            if (i > 1 && Number(sessionId[i-1]) && sessionId[i-2] === '%') session += sessionId[i].toUpperCase();
            else session += sessionId[i];
        }
        await db.updateEmissionReport('azul', emission._id, 1, null, null);

        // Real login
        Requester.require({
            session: pSession,
            request: {url: 'https://webservices.voeazul.com.br/TudoAzulMobile/TudoAzulMobileManager.svc/LogonGetBalance',
                headers: { 'Content-Type': 'application/json' },
                json: credentials,
                jar: cookieJar
            }
        }).then(async function (body) {
            if (!body || !body.LogonResponse || !body.LogonResponse.SessionID) {
                if (data.credentials.cpf && data.credentials.login) {
                    await db.updateEmissionReport('azul', emission._id, 2, "Couldn't login. Trying again.", body);

                    credentials.AgentName = data.credentials.login;
                    var body = await Requester.require({
                        session: pSession,
                        request: {
                            url: 'https://webservices.voeazul.com.br/TudoAzulMobile/TudoAzulMobileManager.svc/LogonGetBalance',
                            headers: {'Content-Type': 'application/json'},
                            json: credentials,
                            jar: cookieJar
                        }
                    });

                    if (!body || !body.LogonResponse || !body.LogonResponse.SessionID) {
                        Requester.killSession(pSession);
                        await db.updateEmissionReport('azul', emission._id, 2, "Couldn't login.", body, true);
                        return;
                    }
                } else {
                    Requester.killSession(pSession);
                    await db.updateEmissionReport('azul', emission._id, 2, "Couldn't login.", body, true);
                    return;
                }

            }

            var userSession = body.LogonResponse.SessionID;
            var customerNumber = body.LogonResponse.CustomerNumber;
            await db.updateEmissionReport('azul', emission._id, 2, null, null);

            var customerInfo = (await Requester.require({
                session: pSession,
                request: {
                    url: 'https://webservices.voeazul.com.br/TudoAzulMobile/TudoAzulMobileManager.svc/GetAgent',
                    json: { CustomerNumber: customerNumber },
                    jar: cookieJar}
            }));
            if (!customerInfo) {
                Requester.killSession(pSession);
                db.updateEmissionReport('azul', emission._id, 3, "Couldn't get customer info", customerInfo, true);
                return;
            }
            await db.updateEmissionReport('azul', emission._id, 3, null, null);

            // Get all flights again (for a matter of cookies)
            var redeemUrl = `https://webservices.voeazul.com.br/TudoAzulMobile/LoyaltyManager.svc/GetAvailabilityByTrip?sessionId=${session}&userSession=${userSession}`;

            var redeemData = (await Requester.require({
                session: pSession,
                request: {url: redeemUrl, json: Formatter.formatAzulRedeemForm(params, data), jar: cookieJar}
            }))["GetAvailabilityByTripResult"];

            if (!redeemData || !redeemData.Result || !redeemData.Result.Success) {
                Requester.killSession(pSession);
                db.updateEmissionReport('azul', emission._id, 4, "Couldn't get flights", redeemData, true);
                return;
            }
            await db.updateEmissionReport('azul', emission._id, 4, null, null);

            var goingFare = null;
            if (data.going_flight_id) {
                goingFare = getFare(resources, redeemData["Schedule"]["ArrayOfJourneyDateMarket"][0]["JourneyDateMarket"][0]["Journeys"]["Journey"], data.going_flight_id, params);
                if(!goingFare) {
                    db.updateEmissionReport('azul', emission._id, 4, "Price of flight got higher or is unavailable.", null, true);
                    return;
                }
            }

            var returningFare = null;
            if (data.returning_flight_id) {
                returningFare = getFare(resources, redeemData["Schedule"]["ArrayOfJourneyDateMarket"][0]["JourneyDateMarket"]
                    [(!data.going_flight_id && data.returning_flight_id) ? 0 : 1]["Journeys"]["Journey"], data.returning_flight_id, params);
                if(!returningFare) {
                    db.updateEmissionReport('azul', emission._id, 4, "Price of flight got higher or is unavailable.", null, true);
                    return;
                }
            }

            Requester.require({
                session: pSession,
                request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/PriceItineraryByKeysV3?sessionId=${session}&userSession=${userSession}`,
                    headers: { 'Content-Type': 'application/json' },
                    json: Formatter.formatAzulItineraryForm(data, params, resources),
                    jar: cookieJar
                }
            }).then(async function (body) {
                var priceItineraryByKeys = body;
                await db.updateEmissionReport('azul', emission._id, 5, null, null);

                var sellForm = Formatter.formatAzulSellForm(data, resources);
                Requester.require({
                    session: pSession,
                    request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/SellByKeyV3?sessionId=${session}&userSession=${userSession}`,
                        headers: { 'Content-Type': 'application/json' },
                        json: sellForm,
                        jar: cookieJar
                    }
                }).then(async function (body) {
                    if (!body || !body.SellByKeyV3Result || !body.SellByKeyV3Result.Result.Success) {
                        Requester.killSession(pSession);
                        db.updateEmissionReport('azul', emission._id, 6, "Couldn't get SellByKeyV3Result", body, true);
                        return;
                    }
                    var sellByKey = JSON.parse(body.SellByKeyV3Result.SellByKey);

                    var totalTax = 0;
                    for (let journey of sellByKey.JourneyServices) {
                        for (let fare of journey.Fares) {
                            for (let paxFare of fare.PaxFares) {
                                for (let charge of paxFare.InternalServiceCharges) {
                                    if (charge.ChargeType === 4) {
                                        totalTax += charge.Amount;
                                    }
                                }
                            }
                        }
                    }
                    totalTax = totalTax;
                    var taxString = totalTax.toFixed(2).replace('.', '');

                    if (!verifyTaxes(getFlightById(data.going_flight_id, requested.response.Trechos),
                            getFlightById(data.returning_flight_id, requested.response.Trechos), totalTax, data.passengers)) {
                        db.updateEmissionReport('azul', emission._id, 6, "Higher tax price.", null, true);
                        return;
                    }

                    var paymentInstallmentInfo = {
                        TaxAmount: taxString,
                        PaymentMethodCode: data.payment.card_brand_code,
                        CurrencyCode: 'BRL',
                        ArrivalStation: (!data.going_flight_id && data.returning_flight_id) ? params.originAirportCode : params.destinationAirportCode,
                        DepartureStation: (!data.going_flight_id && data.returning_flight_id) ? params.destinationAirportCode : params.originAirportCode,
                        Amount: taxString
                    };
                    await db.updateEmissionReport('azul', emission._id, 6, null, null);


                    var booking = (await Requester.require({
                        session: pSession,
                        request: {
                            url: 'https://webservices.voeazul.com.br/ACSJson/Servicos/BookingService.svc/GetBookingFromState',
                            json: {signature: unescape(sessionId.replace(/\+/g, " ")), userInterface: 'mobileadruser'},
                            jar: cookieJar
                        }
                    }));

                    var setJourney = JSON.parse((await Requester.require({
                        session: pSession,
                        request: {
                            url: 'https://webservices.voeazul.com.br/ACSJson/Servicos/BookingService.svc/setJourneyToUseMultiJourney?sessionId=' + sessionId,
                            json: {journeyToUse: 0},
                            jar: cookieJar
                        }
                    })).substring(1));
                    if (!setJourney || !setJourney.Resultado.Sucesso) {
                        Requester.killSession(pSession);
                        db.updateEmissionReport('azul', emission._id, 7, "Couldn't set journey", setJourney, true);
                        return;
                    }
                    await db.updateEmissionReport('azul', emission._id, 7, null, null);

                    Requester.require({
                        session: pSession,
                        request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/GetPaymentInstallmentInfo`,
                            headers: { 'Content-Type': 'application/json' },
                            json: { paymentInstallmentInfoRequest: JSON.stringify(paymentInstallmentInfo) },
                            jar: cookieJar
                        }
                    }).then(async function (body) {
                        var paymentInstallmentInfoResult = JSON.parse(body.GetPaymentInstallmentInfoResult);

                        var commitResult = (await Requester.require({
                            session: pSession,
                            request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/Commit`,
                                headers: { 'Content-Type': 'application/json' },
                                json: Formatter.formatAzulCommitForm(data, customerInfo, customerNumber, sessionId),
                                jar: cookieJar
                            }
                        }));
                        if (!commitResult) {
                            Requester.killSession(pSession);
                            db.updateEmissionReport('azul', emission._id, 8, "Couldn't get commit result", commitResult, true);
                            return;
                        }
                        try {
                            var commitResultJson = JSON.parse(commitResult.CommitResult);
                        } catch (err) {
                            db.updateEmissionReport('azul', emission._id, 8, err.stack, commitResult, true);
                            return;
                        }
                        await db.updateEmissionReport('azul', emission._id, 8, null, commitResult, false, {locator: commitResultJson.RecordLocator});

                        var seatVoucher = JSON.parse((await Requester.require({
                            session: pSession,
                            request: {url: `https://webservices.voeazul.com.br/ACSJson/Servicos/CheckinOperationService.svc/RedeemSeatVouchers?sessionId=${sessionId}&userSession=${userSession}`,
                                jar: cookieJar, method: 'POST'
                            }
                        })).substring(1));
                        if (!seatVoucher || !seatVoucher.Resultado.Sucesso) {
                            Requester.killSession(pSession);
                            db.updateEmissionReport('azul', emission._id, 9, "Couldn't redeem seat voucher", seatVoucher, true);
                            return;
                        }
                        var payment = Formatter.formatAzulPaymentForm(data, totalTax, commitResultJson, priceItineraryByKeys, requested.response.Trechos, goingFare, returningFare);
                        await db.updateEmissionReport('azul', emission._id, 9, null, commitResult, false, {locator: commitResultJson.RecordLocator});

                        Requester.require({
                            session: pSession,
                            request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/AddPayments?sessionId=${sessionId}&userSession=${userSession}`,
                                headers: { 'Content-Type': 'application/json' },
                                json: payment,
                                jar: cookieJar
                            }
                        }).then(async function (body) {
                            if (!body || (body.AddPaymentsResult && !body.AddPaymentsResult.Result.Success)) {
                                Requester.killSession(pSession);
                                db.updateEmissionReport('azul', emission._id, 10, "Something went wrong while paying.", body, true, {locator: commitResultJson.RecordLocator});
                                return;
                            }
                            var paymentId = body.AddPaymentsResult.PaymentId;
                            await db.updateEmissionReport('azul', emission._id, 10, null, body, false, {locator: commitResultJson.RecordLocator});

                            Requester.require({
                                session: pSession,
                                request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/AddBookingToCustomer`,
                                    headers: { 'Content-Type': 'application/json' },
                                    json: {CustomerNumber: customerNumber, RecordLocators: [payment.addPaymentsRequest.RecordLocator]},
                                    jar: cookieJar
                                }
                            }).then(function (body) {
                                db.updateEmissionReport('azul', emission._id, 11, null, body, true, {locator: payment.addPaymentsRequest.RecordLocator});
                            }).catch(function (err) {
                                Requester.killSession(pSession);
                                db.updateEmissionReport('azul', 'azul', emission._id, 11, err.stack, null, true);
                            })
                        }).catch(function (err) {
                            Requester.killSession(pSession);
                            db.updateEmissionReport('azul', emission._id, 10, err.stack, null, true);
                        })
                    }).catch(function (err) {
                        Requester.killSession(pSession);
                        db.updateEmissionReport('azul', emission._id, 8, err.stack, null, true);
                    })
                }).catch(function (err) {
                    Requester.killSession(pSession);
                    db.updateEmissionReport('azul', emission._id, 6, err.stack, null, true);
                });
            }).catch(function (err) {
                Requester.killSession(pSession);
                db.updateEmissionReport('azul', emission._id, 5, err.stack, null, true);
            });
        }).catch(function (err) {
            Requester.killSession(pSession);
            db.updateEmissionReport('azul', emission._id, 2, err.stack, null, true);
        });
    }).catch(function (err) {
        Requester.killSession(pSession);
        db.updateEmissionReport('azul', emission._id, 1, err.stack, null, true);
    });
}

// returns true if the price is the same
function getFare(resources, flights, flightId, params) {
    try {
        var flightSellKey = resources[flightId].JourneySellKey;
        var firstPrice = resources[flightId].miles.Adulto;

        for (flight of flights) {
            var sellKey = (flight["JourneySellKey"]) ? flight["JourneySellKey"] : flight["SellKey"];
            if (sellKey === flightSellKey) {
                var segments = (flight["Segments"]["Segment"]) ? flight["Segments"]["Segment"] : flight["Segments"];
                var fare = null;
                if (segments[0]["Fares"]["Fare"]) {
                    if (!segments[0]["Fares"]["Fare"][0]["PaxFares"]) return null;
                    if (params.originCountry !== params.destinationCountry) {
                        for (var itFare of segments[0]["Fares"]["Fare"]) {
                            if (params.executive ? itFare["ProductClass"] !== "AY" :
                                (ECONOMIC_PRODUCT_CLASS.indexOf(itFare["ProductClass"]) !== -1) &&
                                itFare["LoyaltyAmounts"] && itFare["LoyaltyAmounts"].length > 0) {
                                fare = itFare;
                            }
                        }
                    } else {
                        fare = segments[0]["Fares"]["Fare"][0]
                    }
                }

                if (!fare) return null;

                if (fare["LoyaltyAmounts"][0]["Amount"] === 0 && fare["LoyaltyAmounts"][0]["Points"] <= firstPrice) {
                    console.log('Achou voo');
                    return fare;
                }
            }
        }
    } catch (e) {
        return null;
    }

    return null;
}

function verifyTaxes(goingFlight, returningFlight, azulTotalTax, passengers) {
    var tax = 0;
    if (goingFlight) tax += goingFlight["Milhas"][0]["TaxaEmbarque"];
    if (returningFlight) tax += returningFlight["Milhas"][0]["TaxaEmbarque"];
    tax = tax * Formatter.countPassengers(passengers);

    if (tax >= azulTotalTax) return true;

    return false;
}

function getFlightById(id, stretches) {
    if (!id) return null;

    for (var stretch in stretches) {
        for (var flight of stretches[stretch].Voos) {
            if (flight._id.toString() === id) return flight;
        }
    }
    return null;
}