/**
 * @author Anderson Menezes
 */
module.exports = {
    issueTicket: issueTicket
};

const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
const MESSAGES = require('../util/helpers/messages');
const Proxy = require ('../util/services/proxy');

async function issueTicket(req, res, next) {
    var pSession = Proxy.createSession('azul');
    var data = req.body;
    var requested = await db.getRequest(data.request_id);
    var resources = await db.getRequestResources(data.request_id);
    resources = resources.resources;
    if (!requested || !resources) {
        Proxy.killSession(pSession);
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
        "AgentName": data.credentials.login,
        "Password": data.credentials.password,
        "Device": 3
    };
    // Default login to get session
    Proxy.require({
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
        Proxy.require({
            session: pSession,
            request: {url: 'https://webservices.voeazul.com.br/TudoAzulMobile/TudoAzulMobileManager.svc/LogonGetBalance',
                headers: { 'Content-Type': 'application/json' },
                json: credentials,
                jar: cookieJar
            }
        }).then(async function (body) {
            if (!body || !body.LogonResponse || !body.LogonResponse.SessionID) {
                Proxy.killSession(pSession);
                await db.updateEmissionReport('azul', emission._id, 2, "Couldn't login.", body, true);
                return;
            }

            var userSession = body.LogonResponse.SessionID;
            var customerNumber = body.LogonResponse.CustomerNumber;
            await db.updateEmissionReport('azul', emission._id, 2, null, null);

            var customerInfo = (await Proxy.require({
                session: pSession,
                request: {
                    url: 'https://webservices.voeazul.com.br/TudoAzulMobile/TudoAzulMobileManager.svc/GetAgent',
                    json: { CustomerNumber: customerNumber },
                    jar: cookieJar}
            }));
            if (!customerInfo) {
                Proxy.killSession(pSession);
                db.updateEmissionReport('azul', emission._id, 3, "Couldn't get customer info", customerInfo, true);
                return;
            }
            await db.updateEmissionReport('azul', emission._id, 3, null, null);

            // Get all flights again (for a matter of cookies)
            var redeemUrl = `https://webservices.voeazul.com.br/TudoAzulMobile/LoyaltyManager.svc/GetAvailabilityByTrip?sessionId=${session}&userSession=${userSession}`;

            var redeemData = (await Proxy.require({
                session: pSession,
                request: {url: redeemUrl, json: Formatter.formatAzulRedeemForm(params), jar: cookieJar}
            }))["GetAvailabilityByTripResult"];
            if (!redeemData) {
                Proxy.killSession(pSession);
                db.updateEmissionReport('azul', emission._id, 4, "Couldn't get flights", redeemData, true);
                return;
            }
            await db.updateEmissionReport('azul', emission._id, 4, null, null);

            Proxy.require({
                session: pSession,
                request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/PriceItineraryByKeysV3?sessionId=${session}&userSession=${userSession}`,
                    headers: { 'Content-Type': 'application/json' },
                    json: Formatter.formatAzulItineraryForm(data, params, resources),
                    jar: cookieJar
                }
            }).then(async function (body) {
                var priceItineraryByKeys = body;
                await db.updateEmissionReport('azul', emission._id, 5, null, null);

                var sellForm = Formatter.formatAzulSellForm(data, params, resources);
                debugger;
                Proxy.require({
                    session: pSession,
                    request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/SellByKeyV3?sessionId=${session}&userSession=${userSession}`,
                        headers: { 'Content-Type': 'application/json' },
                        json: sellForm,
                        jar: cookieJar
                    }
                }).then(async function (body) {
                    if (!body || !body.SellByKeyV3Result || !body.SellByKeyV3Result.Result.Success) {
                        Proxy.killSession(pSession);
                        db.updateEmissionReport('azul', emission._id, 6, "Couldn't get SellByKeyV3Result", body, true);
                        return;
                    }
                    var sellByKey = JSON.parse(body.SellByKeyV3Result.SellByKey);

                    var totalTax = 0;
                    for (var journey of sellByKey.JourneyServices) {
                        for (var fare of journey.Fares) {
                            for (var paxFare of fare.PaxFares) {
                                for (var charge of paxFare.InternalServiceCharges) {
                                    if (charge.ChargeCode === 'TXE') {
                                        totalTax += charge.Amount;
                                    }
                                }
                            }
                        }
                    }
                    totalTax = totalTax * data.passengers.length;
                    var taxString = totalTax.toFixed(2).replace('.', '');

                    var paymentInstallmentInfo = {
                        TaxAmount: taxString,
                        PaymentMethodCode: data.payment.card_brand_code,
                        CurrencyCode: 'BRL',
                        ArrivalStation: params.destinationAirportCode,
                        DepartureStation: params.originAirportCode,
                        Amount: taxString
                    };
                    await db.updateEmissionReport('azul', emission._id, 6, null, null);


                    var booking = (await Proxy.require({
                        session: pSession,
                        request: {
                            url: 'https://webservices.voeazul.com.br/ACSJson/Servicos/BookingService.svc/GetBookingFromState',
                            json: {signature: unescape(sessionId.replace(/\+/g, " ")), userInterface: 'mobileadruser'},
                            jar: cookieJar
                        }
                    }));

                    var setJourney = JSON.parse((await Proxy.require({
                        session: pSession,
                        request: {
                            url: 'https://webservices.voeazul.com.br/ACSJson/Servicos/BookingService.svc/setJourneyToUseMultiJourney?sessionId=' + sessionId,
                            json: {journeyToUse: 0},
                            jar: cookieJar
                        }
                    })).substring(1));
                    if (!setJourney || !setJourney.Resultado.Sucesso) {
                        Proxy.killSession(pSession);
                        db.updateEmissionReport('azul', emission._id, 7, "Couldn't set journey", setJourney, true);
                        return;
                    }
                    await db.updateEmissionReport('azul', emission._id, 7, null, null);

                    Proxy.require({
                        session: pSession,
                        request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/GetPaymentInstallmentInfo`,
                            headers: { 'Content-Type': 'application/json' },
                            json: { paymentInstallmentInfoRequest: JSON.stringify(paymentInstallmentInfo) },
                            jar: cookieJar
                        }
                    }).then(async function (body) {
                        var paymentInstallmentInfoResult = JSON.parse(body.GetPaymentInstallmentInfoResult);

                        var commitResult = (await Proxy.require({
                            session: pSession,
                            request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/Commit`,
                                headers: { 'Content-Type': 'application/json' },
                                json: Formatter.formatAzulCommitForm(data, customerInfo, customerNumber, sessionId),
                                jar: cookieJar
                            }
                        }));
                        if (!commitResult) {
                            Proxy.killSession(pSession);
                            db.updateEmissionReport('azul', emission._id, 8, "Couldn't get commit result", commitResult, true);
                            return;
                        }
                        var commitResultJson = JSON.parse(commitResult.CommitResult);
                        await db.updateEmissionReport('azul', emission._id, 8, null, commitResult, false, {locator: commitResultJson.RecordLocator});

                        var seatVoucher = JSON.parse((await Proxy.require({
                            session: pSession,
                            request: {url: `https://webservices.voeazul.com.br/ACSJson/Servicos/CheckinOperationService.svc/RedeemSeatVouchers?sessionId=${sessionId}&userSession=${userSession}`,
                                jar: cookieJar, method: 'POST'
                            }
                        })).substring(1));
                        if (!seatVoucher || !seatVoucher.Resultado.Sucesso) {
                            Proxy.killSession(pSession);
                            db.updateEmissionReport('azul', emission._id, 9, "Couldn't redeem seat voucher", seatVoucher, true);
                            return;
                        }
                        var payment = Formatter.formatAzulPaymentForm(data, params, totalTax, commitResultJson, priceItineraryByKeys, requested.response.Trechos);
                        await db.updateEmissionReport('azul', emission._id, 9, null, null);

                        Proxy.require({
                            session: pSession,
                            request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/AddPayments?sessionId=${sessionId}&userSession=${userSession}`,
                                headers: { 'Content-Type': 'application/json' },
                                json: payment,
                                jar: cookieJar
                            }
                        }).then(async function (body) {
                            if (!body || (body.AddPaymentsResult && !body.AddPaymentsResult.Result.Success)) {
                                Proxy.killSession(pSession);
                                db.updateEmissionReport('azul', emission._id, 10, "Something went wrong while paying.", body, true);
                                return;
                            }
                            try {
                                var paymentId = body.AddPaymentsResult.PaymentId;
                            } catch (e) {
                                try {
                                    await db.updateEmissionReport('azul', emission._id, 10, JSON.stringify(body), null);
                                } catch (e) {
                                    await db.updateEmissionReport('azul', emission._id, 10, e.stack, body);
                                }
                            }
                            await db.updateEmissionReport('azul', emission._id, 10, null, null);

                            Proxy.require({
                                session: pSession,
                                request: {url: `https://webservices.voeazul.com.br/TudoAzulMobile/BookingManager.svc/AddBookingToCustomer`,
                                    headers: { 'Content-Type': 'application/json' },
                                    json: {CustomerNumber: customerNumber, RecordLocators: [payment.addPaymentsRequest.RecordLocator]},
                                    jar: cookieJar
                                }
                            }).then(function (body) {
                                db.updateEmissionReport('azul', emission._id, 11, null, body, true, {locator: payment.addPaymentsRequest.RecordLocator});
                            }).catch(function (err) {
                                Proxy.killSession(pSession);
                                db.updateEmissionReport('azul', 'azul', emission._id, 11, err.stack, null, true);
                            })
                        }).catch(function (err) {
                            Proxy.killSession(pSession);
                            db.updateEmissionReport('azul', emission._id, 10, err.stack, null, true);
                        })
                    }).catch(function (err) {
                        Proxy.killSession(pSession);
                        db.updateEmissionReport('azul', emission._id, 8, err.stack, null, true);
                    })
                }).catch(function (err) {
                    Proxy.killSession(pSession);
                    db.updateEmissionReport('azul', emission._id, 6, err.stack, null, true);
                });
            }).catch(function (err) {
                Proxy.killSession(pSession);
                db.updateEmissionReport('azul', emission._id, 5, err.stack, null, true);
            });
        }).catch(function (err) {
            Proxy.killSession(pSession);
            db.updateEmissionReport('azul', emission._id, 2, err.stack, null, true);
        });
    }).catch(function (err) {
        Proxy.killSession(pSession);
        db.updateEmissionReport('azul', emission._id, 1, err.stack, null, true);
    });
}