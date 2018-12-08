/**
 * @author Anderson Menezes
 */
module.exports = {
    issueTicket: issueTicket,
    getAccountBalance: getAccountBalance
};

const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
const Proxy = require ('../util/services/proxy');
const cheerio = require('cheerio');

function formatUrl(params) {
    return 'https://www.latam.com/pt_br/apps/multiplus/booking?application=lanpass' +
        `&from_city1=${params.originAirportCode}&to_city1=${params.destinationAirportCode}` +
        (!params.returnDate ? '' : (`&from_city2=${params.destinationAirportCode}&to_city2=${params.originAirportCode}` +
        `&fecha2_dia=${params.returnDate.split('-')[2]}&fecha2_anomes=${params.returnDate.split('-')[0] + '-' + params.returnDate.split('-')[1]}`)) +
        `&fecha1_dia=${params.departureDate.split('-')[2]}&fecha1_anomes=${params.departureDate.split('-')[0] + '-' + params.departureDate.split('-')[1]}` +
        `&ida_vuelta=${params.returnDate ? 'ida_vuelta' : 'ida'}&nadults=${params.adults}&nchildren=${params.children}&ninfants=0&cabina=Y`;
}

function getExtraParam(loginPage) {
    var $ = cheerio.load(loginPage);
    var extraParam = $('#extraParam').attr('value');
    return extraParam;
}

async function issueTicket(req, res, next) {
    var pSession = Proxy.createSession('latam');
    var data = req.body;

    var requested = await db.getRequest(data.request_id);
    var resources = await db.getRequestResources(data.request_id);
    var params = requested.params;

    if (!requested) {
        Proxy.killSession(pSession);
        res.status(404);
        res.json();
        return;
    }

    var homeRes = await Proxy.require({
        session: pSession,
        request: {
            url: 'https://www.pontosmultiplus.com/pt_br'
        }
    });

    var jar = Proxy.getSessionJar(pSession);

    debugger;

    var searchUrl = formatUrl(params);
    var searchRes = await Proxy.require({
        session: pSession,
        request: {
            url: searchUrl
        }
    });

    var loginPageUrl = 'https://www.latam.com/cgi-bin/site_login.cgi?page=' + searchUrl;
    var loginPageRes = await Proxy.require({
        session: pSession,
        request: {
            url: loginPageUrl
        }
    });

    var extraParam = getExtraParam(loginPageRes);
    var loginUrl = 'https://www.latam.com/cgi-bin/login/login_latam.cgi';
    var loginRes = await Proxy.require({
        session: pSession,
        request: {
            url: loginUrl,
            form: {
                'cm_target_action': searchUrl,
                'login': data.credentials.login,
                'password': data.credentials.password,
                'extraParam': extraParam
            }
        }
    });

    var authToken = getAuthTokenFromBody(loginRes);
    var loginRedirectUrl = getRedirectUrlFromBody(loginRes);

    var redirectedLoginRes = await Proxy.require({
        session: pSession,
        request: {
            url: loginRedirectUrl
        }
    });

    var sessionLoginUrl = getSessionLoginUrlFromBody(redirectedLoginRes);
    var redirectedSearchUrl = getRedirectUrlFromBody(redirectedLoginRes);

    var sessionLoginRes = await Proxy.require({
        session: pSession,
        request: {
            url: sessionLoginUrl
        }
    });

    var redirectedSearchRes = await Proxy.require({
        session: pSession,
        request: {
            url: redirectedSearchUrl
        }
    });

    jar = Proxy.getSessionJar(pSession);
    debugger;

    var deviceId = formatDeviceId(loginRedirectUrl);

    var generatedTrackId = generateTrackId();

    var featuresRes = await Proxy.require({
        session: pSession,
        request: {
            url: `https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/features?country=BR&portal=multiplus&tripType=${params.returnDate ? 'roundTrip' : 'oneWay'}`,
            headers: {
                'x-home': 'pt_br',
                'x-track-id': generatedTrackId,
                'x-trackId': generatedTrackId
            },
            resolveWithFullResponse: true
        }
    });
    var flowId = featuresRes.headers['x-flow-id'];
    var requestId = featuresRes.headers['x-request-id'];
    var trackId = featuresRes.headers['x-track-id'];

    generatedTrackId = generateTrackId();

    var informationRes = await Proxy.require({
        session: pSession,
        request: {
            url: 'https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/customer/information',
            headers: {
                'x-auth-token': authToken,
                'x-flow-id': flowId,
                'x-flowId': flowId,
                'x-home': 'pt_br',
                'x-track-id': generatedTrackId,
                'x-trackId': generatedTrackId
            },
            resolveWithFullResponse: true
        }
    });

    var originsBBRes = await Proxy.require({
        session: pSession,
        request: {
            url: 'https://www.latam.com/ws/api/booking-box/v2/originsBB?airline=tam&portal=pessoas&application=fidelidade&country=BR&language=pt',
            headers: {
                'flowid': flowId,
                'trackid': trackId
            },
            resolveWithFullResponse: true
        }
    });

    trackId = originsBBRes.headers['trackid'].split(', ')[0];

    if (data.going_flight_id) {
        var goingFlightsRes = await Proxy.require({
            session: pSession,
            request: {
                method: 'GET',
                url: `https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/redemption/recommendations/outbound?country=BR&language=PT&home=pt_br&` +
                        `origin=${params.originAirportCode}&destination=${params.destinationAirportCode}&departure=${params.departureDate}&adult=${params.adults}&cabin=Y&tierType=low` +
                        (data.returning_flight_id ? `&return=${params.returnDate}` : ''),
                headers: {
                    'flowid': flowId
                },
                resolveWithFullResponse: true
            }
        });
        var goingFlights = JSON.parse(goingFlightsRes.body);
        var goingFlight = getFlightByCode(goingFlights.data.flights,
            getFlightById(requested.response.Trechos[params.originAirportCode+params.destinationAirportCode].Voos, data.going_flight_id));
    }

    if (data.returning_flight_id) {
        var returningFlightsRes = await Proxy.require({
            session: pSession,
            request: {
                method: 'GET',
                url: `https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/redemption/recommendations/inbound?country=BR&language=PT&home=pt_br&` +
                `origin=${params.originAirportCode}&destination=${params.destinationAirportCode}&departure=${params.departureDate}&adult=${params.adults}&cabin=Y&tierType=low` +
                (data.returning_flight_id ? `&return=${params.returnDate}` : '') + `&fareId=${goingFlight.cabins[0].fares[0].fareId}`,
                headers: {
                    'flowid': flowId
                },
                resolveWithFullResponse: true
            }
        });
        var returningFlights = JSON.parse(returningFlightsRes.body);
        var returningFlight = getFlightByCode(returningFlights.data.flights,
            getFlightById(requested.response.Trechos[params.destinationAirportCode+params.originAirportCode].Voos, data.returning_flight_id));
    }

    if (goingFlight) {
        var goingFlightStatsRes = await Proxy.require({
            session: pSession,
            request: {
                url: `https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/flightstats?0[airlineCode]=${goingFlight.segments[0].airline.code}&0[flightNumber]=${goingFlight.segments[0].flightNumber}&0[origin]=${goingFlight.departure.airportCode}&0[destination]=${goingFlight.arrival.airportCode}`,
                headers: {
                    'flowid': flowId,
                    'trackid': trackId
                },
                resolveWithFullResponse: true
            }
        });
    }

    if (returningFlight) {
        var returningFlightStatsRes = await Proxy.require({
            session: pSession,
            request: {
                url: `https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/flightstats?0[airlineCode]=${returningFlight.segments[0].airline.code}&0[flightNumber]=${returningFlight.segments[0].flightNumber}&0[origin]=${returningFlight.departure.airportCode}&0[destination]=${returningFlight.arrival.airportCode}`,
                headers: {
                    'flowid': flowId,
                    'trackid': trackId
                },
                resolveWithFullResponse: true
            }
        });
    }

    debugger;

    var selectFlightsForm = formatSelectFlightsForm(goingFlight, returningFlight, data.passengers, flowId, deviceId);
    var selectFlightsRes = await Proxy.require({
        session: pSession,
        request: {
            url: 'https://ssl.lan.com/cgi-bin/cobro_premio/paso3.cgi',
            form: { sessionParameters: JSON.stringify(selectFlightsForm), homeInfo: 'pt_br', just_refresh: '1' },
            headers: {
                'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'content-type': 'application/x-www-form-urlencoded',
                'referer': searchUrl,
                'sec-metadata': 'cause="forced", destination="document", site="cross-site"',
                'upgrade-insecure-requests': '1'
            }
        }
    });

    debugger;
}

function generateGuid() {
    function generateGuidPart() {
        return Math.floor((1 + Math.random()) * 65536).toString(16).substring(1)
    }

    return generateGuidPart() + generateGuidPart() + "-" + generateGuidPart() + "-" + generateGuidPart() + "-" + generateGuidPart() + "-" + generateGuidPart() + generateGuidPart() + generateGuidPart()
}

function formatDeviceId(redirectedUrl) {
    var deviceId = {
        browser: {
            audioFP: "f7e8100bea32d539dd50cf5f731603af",
            browser: "Chrome",
            browserVersion: "70",
            buildID: "20030107",
            canvasFP: "68ddfd85df5e75509f868db00c14b017",
            canvasFP2: "def8540be382de5489e4a9a26a690667",
            colorDepth: 24,
            cookie: generateGuid(),
            doNotTrack: "false",
            extensions: {
                default: [],
                developer: [],
                popular: [],
                suspect: []
            },
            flashVersion: "N/A",
            fontsJS: ["Arial", "Arial Black", "Arial Narrow", "Calibri", "Cambria", "Cambria Math", "Comic Sans MS", "Consolas", "Courier", "Courier New", "Georgia", "Helvetica", "Impact", "Lucida Console", "Lucida Sans Unicode", "MS Gothic", "MS PGothic", "MS Sans Serif"],
            fontsJS2: ["ADOBE CASLON PRO", "ADOBE GARAMOND PRO", "Aharoni", "Andalus", "Angsana New", "AngsanaUPC", "Aparajita", "Arabic Typesetting", "Arial", "Arial Black", "Arial Narrow", "Batang", "BatangChe", "Browallia New", "BrowalliaUPC", "Calibri", "Cambria"],
            has: {
                adBlockEnabled: false,
                cookieEnabled: true,
                indexedDB: true,
                java: false,
                liedBrowser: false,
                liedLanguages: false,
                localStorage: true,
                openDatabase: true,
                sessionStorage: true
            },
            icognito: false,
            language: "pt-BR",
            pixelRatio: 1,
            plugins: ["Chrome PDF Plugin applicationxgooglechromepdfpdf", "Chrome PDF Viewer applicationpdfpdf", "Native Client applicationxnaclapplicationxpnacl"],
            referer: redirectedUrl,
            silverlightVersion: "N/A",
            themes: "N/A",
            userAgent: "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.77 Safari/537.36",
            vendor: "Google Inc.",
            webglFP: "9fe26e16d06492fa714d62b3eb9086ac"
        },
        network: {
            connection: {
                downlink: 10,
                downlinkMax: null,
                effectiveType: "4g",
                rtt: 150,
                type: "ethernet"
            },
            geolocation: {
                accuracy: 0,
                latitude: 0,
                longitude: 0
            },
            internalIP: "TimeOut",
            timeZone: "-180"
        },
        os: {
            audioStackInfo: "44100_2_1_0_2_explicit_speakers",
            availableScreenResolution: "1920,1050",
            battery: {charging: true, chargingTime: "N/A", dischargingTime: "Infinity", level: 1},
            cpuClass: "unknown",
            graphicBoard: "Google SwiftShader|Google Inc.",
            has: {liedOs: false, liedResolution: false},
            mediaDevices: ["audioinput:", "audioinput:", "audioinput:", "audioinput:", "audioinput:", "videoinput:", "audiooutput:", "audiooutput:", "audiooutput:", "audiooutput:"],
            memory: "8GB",
            numberOfCPUCores: 4,
            platform: "Win32",
            screenResolution: "1920,1080",
            touchSupport: {maxTouchPoints: 0, touchEvent: false, touchStart: false}
        }
    };
    return new Buffer(JSON.stringify(deviceId)).toString('hex');
}

function generateTrackId() {
    return Math.random().toString().replace("0.", "").substring(0, 10);
}

function formatSelectFlightsForm(goingFlight, returningFlight, passengers, flowId, deviceId) {
    var form = {
        flowId: flowId,
        deviceId: deviceId,
        step2Type: 'owflex',
        passengers: {
            numberAdults: String(Formatter.countPassengers(passengers, 'ADT')),
            numberInfants: '0',
            numberChildren: String(Formatter.countPassengers(passengers, 'CHD')),
        },
        originalDates: true,
        trip: {
            flights: []
        }
    };

    if (goingFlight) form.trip.flights.push(formatFlightForSelectForm(goingFlight));
    if (returningFlight) form.trip.flights.push(formatFlightForSelectForm(returningFlight));

    return form;
}

function formatFlightForSelectForm(flight) {
    var cabin = flight.cabins[0];
    var cheapestFare = null;
    for (let fare of cabin.fares) {
        if (!cheapestFare || cheapestFare.price.adult.total > fare.price.adult.total) {
            cheapestFare = fare;
        }
    }

    var formatted = {
        amount: cheapestFare.price.adult.total,
        currency: 'PTS',
        family: cheapestFare.code,
        segments: []
    };

    for (let segment of flight.segments) {
        let seg = {
            arrival_airport: segment.arrival.airportCode,
            arrival_date: segment.arrival.date,
            brand: cheapestFare.code,
            class: segment.familiesMap[cabin.code+'-'+cheapestFare.category].segmentClass,
            departure_airport: segment.departure.airportCode,
            departure_date: segment.departure.date,
            farebasis: segment.familiesMap[cabin.code+'-'+cheapestFare.category].farebasis,
            flight_number: segment.flightNumber,
            marketing_airline: segment.flightCode.replace(segment.flightNumber, '')
        };

        formatted.segments.push(seg);
    }

    return formatted;
}

function getFlightById(responseFlights, id) {
    for (let flight of responseFlights) {
        if (flight._id.toString() === id) return flight;
    }

    return null;
}

function getFlightByCode(flights, responseFlight) {
    if (!responseFlight) return null;

    var code = responseFlight.Conexoes.length ? "" : responseFlight.NumeroVoo;
    for (let connection of responseFlight.Conexoes) {
        code += connection.NumeroVoo;
    }

    for (let flight of flights) {
        if (flight.flightCode === code) return flight;
    }

    return null;
}

function getFromBody(body, key, startSymbol, endSymbol) {
    var result = '';
    var started = false;
    for (let i = body.indexOf(key); i < body.length; i++) {
        if (!started) {
            if (body[i] === startSymbol) started = true;
        } else {
            if (body[i] === endSymbol) break;
            result += body[i];
        }
    }

    return result;
}

function getAuthTokenFromBody(body) {
    return getFromBody(body, 'auth_token', '=', ';');
}

function getRedirectUrlFromBody(body) {
    return getFromBody(body, 'window.location=', '"', '"');
}

function getSessionLoginUrlFromBody(body) {
    return getFromBody(body, 'iframe', '"', '"');
}

async function getAccountBalance(req, res, next) {
    // response
    res.status(200);
    res.json();

    debugger;
    // continua processando
    // cpf,senha
    var accounts =
        "06513054025,123456\n";
    accounts = accounts.split("\n");

    var map = {};
    var pSession = Proxy.createSession('latam');

    var i = 0;
    var tries = 0;
    while (i < accounts.length) {
        try {
            tries++;
            pSession = Proxy.createSession('latam');
            var row = accounts[i];
            var login = row.split(',')[0].trim();
            var password = row.split(',')[1].trim();

            if (!login || !password) {
                console.log('erro: ' + row);
                continue;
            }

            var searchUrl = formatUrl(params);
            var searchRes = await Proxy.require({
                session: pSession,
                request: {
                    url: searchUrl
                }
            });

            var loginPageUrl = 'https://www.latam.com/cgi-bin/site_login.cgi?page=' + searchUrl;
            var loginPageRes = await Proxy.require({
                session: pSession,
                request: {
                    url: loginPageUrl
                }
            });

            var extraParam = getExtraParam(loginPageRes);
            var loginUrl = 'https://www.latam.com/cgi-bin/login/login_latam.cgi';
            var loginRes = await Proxy.require({
                session: pSession,
                request: {
                    url: loginUrl,
                    form: {
                        'cm_target_action': searchUrl,
                        'login': login,
                        'password': password,
                        'extraParam': extraParam
                    },
                    resolveWithFullResponse: true
                }
            });

            var header = null;
            for (let h of loginRes.headers['set-cookie']) {
                if (h.indexOf('latam_user_data') !== -1) {
                    header = h;
                }
            }

            var info = decodeURIComponent(header).split(';');
            for (let j of info) {
                if (Number(j)) {
                    map[login] = Number(j);
                }
            }

            Proxy.killSession(pSession);

            if (map[login] === undefined || map[login] === null) {
                if (tries < 3) {
                    console.log('tentando novamente: ' + row);
                } else {
                    i++;
                    tries = 0;
                    console.log('erro: ' + row);
                }
                continue;
            }
            console.log(login + ',' + map[login]);
            i++;
            tries = 0;
        } catch (e) {
            if (tries < 3) {
                console.log('tentando novamente: ' + row);
            } else {
                i++;
                tries = 0;
                console.log('erro: ' + row);
            }
        }
    }

}