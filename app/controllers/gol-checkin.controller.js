/**
 * @author Sávio Muniz
 */

const errorSolver = require("../util/helpers/error-solver");
const Formatter = require('../util/helpers/format.helper');
const validator = require('../util/helpers/validator');
const exception = require('../util/services/exception');
const MESSAGES = require('../util/helpers/messages');
const Requester = require ('../util/services/requester');
const Keys = require('../configs/keys');
const db = require('../util/services/db-helper');

module.exports = {
    getCheckinInfo: getCheckinInfo
};

async function getCheckinInfo(req, res, next) {
    var data = req.query;
    var pSession = Requester.createSession('gol');
    var headers = {};
    var result = {paxs: [], flights: []};

    try {
        var tokenRes = await Requester.require({
            session: pSession,
            request: {
                url: 'https://autenticacao-api.voegol.com.br/osb/autenticacao/authenticate/rest/v1_1/authentication',
                json: {"Credentials":{"Login":"","Password":"","Provider":{"Configuration":{"NSK":{"DomainCode":"WWW"}}}},"Device":{"OperationalSystem":"ANDROID","RemoteAddress":"127.0.0.1","SerialNumber":"2266a2d681c1441d"},"Language":{"Idiom":"pt-BR"},"AccessChannel":{"Channel":"MB"},"BCorpAppId":"038db78f09384b9a95feb2ed561ef85e","BCorpAppSecret":"ff6238e1dd0f411184d8e42a26fab358","Password":""}
            },
        });

        headers['Authorization'] = 'Bearer ' + tokenRes.Result.Authentication.AccessToken.Value;

        var tripRes = await Requester.require({
            session: pSession,
            request: {
                url: 'https://minhasviagens-api.voegol.com.br/osb/minhasviagens/findtripbyrecordlocatorandsurname/rest/v1_5/find-trip-by-recordlocator-surname',
                json: {RecordLocator: data.locator, FirstName: data.firstName, Surname: data.lastName, password: ''},
                headers: headers
            },
        });

        var travelReceiptRes = await Requester.require({
            session: pSession,
            request: {
                url: 'https://minhasviagens-api.voegol.com.br/osb/minhasviagens/travelreceipt/rest/v1_4/travel-receipt',
                json: {RecordLocator: data.locator, password: ''},
                headers: headers
            },
        });

        var boardingPassRes = await Requester.require({
            session: pSession,
            request: {
                url: 'https://minhasviagens-api.voegol.com.br/osb/checkin/boardingpassview/rest/v1_3/boarding-pass-view',
                json: {Booking: {RecordLocator: data.locator, Journey: {JourneySellKey: tripRes.Result.FindBookingByRecordLocatorAndSurname.Booking[0].Journey[0]}}},
                headers: headers
            },
        });

        for (let passenger of travelReceiptRes.Result.TravelReceipt.Booking.Passenger) {
            result.paxs.push({name: passenger.FirstName, lastName: passenger.LastName});
        }

        for (let journey of tripRes.Result.FindBookingByRecordLocatorAndSurname.Booking[0].Journey) {
            var flight = {paths: [], status: journey.Status};
            for (let segment of journey.Segment) {
                flight.paths.push({
                    origem: segment.DepartureStation,
                    destino: segment.ArrivalStation,
                    embarque: segment.STD,
                    desembarque: segment.STA,
                    voo: segment.FlightDesignator.CarrierCode + segment.FlightDesignator.OpSuffix + segment.FlightDesignator.FlightNumber
                });
            }
            result.flights.push(flight);
        }

        res.json(result);
    } catch (err) {
        Requester.killSession(pSession);
        res.status(500).json({err: err.stack});
    }
}