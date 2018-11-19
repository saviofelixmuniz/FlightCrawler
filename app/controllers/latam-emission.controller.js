/**
 * @author Anderson Menezes
 */
module.exports = {
    issueTicket: issueTicket
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

    var featuresRes = await Proxy.require({
        session: pSession,
        request: {
            url: `https://bff.latam.com/ws/proxy/booking-webapp-bff/v1/public/features?country=BR&portal=multiplus&tripType=${params.returnDate ? 'roundTrip' : 'oneWay'}`,
            headers: {

            },
            resolveWithFullResponse: true
        }
    });
    var flowId = featuresRes.headers['x-flow-id'];
    var requestId = featuresRes.headers['x-request-id'];
    var trackId = featuresRes.headers['x-track-id'];

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

    var setPcomCookie = await Proxy.require({
        session: pSession,
        request: {
            url: 'https://ssl.lan.com/cgi-bin/set_cookie_pcom.cgi?pcom=PT%252FBR'
        }
    });

    var selectFlightsForm = formatSelectFlightsForm(goingFlight, returningFlight, data.passengers, flowId);
    var selectFlightsRes = await Proxy.require({
        session: pSession,
        request: {
            url: 'https://ssl.lan.com/cgi-bin/cobro_premio/paso3.cgi',
            form: { sessionParameters: JSON.stringify(selectFlightsForm), homeInfo: 'pt_br', just_refresh: '1' },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'upgrade-insecure-requests': '1',
                'sec-metadata': 'cause="user-activated", destination="document", site="cross-site"',
                'referer': 'https://www.latam.com/pt_br/apps/multiplus/booking?application=lanpass&from_city1=SAO&to_city2=SAO&to_city1=RIO&from_city2=RIO&fecha1_dia=17&fecha1_anomes=2018-11&fecha2_dia=24&fecha2_anomes=2018-11&ida_vuelta=ida_vuelta&nadults=1&nchildren=0&ninfants=0&cabina=Y',
                'origin': 'https://www.latam.com'
            }
        }
    });

    debugger;
}

function formatSelectFlightsForm(goingFlight, returningFlight, passengers, flowId) {
    var form = {
        flowId: flowId,
        deviceId: '7b2262726f77736572223a7b22686173223a7b226164426c6f636b456e61626c6564223a747275652c22636f6f6b6965456e61626c6564223a747275652c22696e64657865644442223a747275652c226a617661223a66616c73652c226c69656442726f77736572223a66616c73652c226c6965644c616e677561676573223a66616c73652c226c6f63616c53746f72616765223a747275652c226f70656e4461746162617365223a747275652c2273657373696f6e53746f72616765223a747275657d2c2262726f77736572223a224368726f6d65222c2262726f7773657256657273696f6e223a223730222c226275696c644944223a223230303330313037222c2263616e7661734650223a223638646466643835646635653735353039663836386462303063313462303137222c2263616e766173465032223a226465663835343062653338326465353438396534613961323661363930363637222c22636f6c6f724465707468223a32342c22636f6f6b6965223a2265323034306466642d303533342d396165652d626538342d326530343162346531663362222c22646f4e6f74547261636b223a2266616c7365222c22666c61736856657273696f6e223a224e2f41222c226c616e6775616765223a2270742d4252222c22706978656c526174696f223a312c22706c7567696e73223a5b224368726f6d652050444620506c7567696e206170706c69636174696f6e78676f6f676c656368726f6d65706466706466222c224368726f6d652050444620566965776572206170706c69636174696f6e706466706466222c224e617469766520436c69656e74206170706c69636174696f6e786e61636c6170706c69636174696f6e78706e61636c225d2c227265666572726572223a2268747470733a2f2f73736c2e6c616e2e636f6d2f6367692d62696e2f6c6f67696e2f63616c6c6261636b2e6367693f746f6b656e3d414b356234444163504d66437a304174714e564d655a7651364f52397436484d4c3378646547433841516f756b516a686c2532467136743339715467766a55595255542532425550707672516b525a4a42436c344f57305745396d77554a3451485571744f693866305671737466374c45554e72414972597746327377767a364c474251586a52326868344153714f5155725331457877744b47373462473456253242754d4b75735454624b253242664c507359473742566645434b4f6263253344266c6174616d5f757365725f646174613d4a45535349434125334243415256414c484f2532304d41434841444f25334255253342373432343836253342474f4c44253342474f4c442533424c4626736d2d73657373696f6e3d3536474149632532423938326b364c444b48304d4f306d4c6f734a30334e4563775a5025324673253246714a6235576d38303859336b4b4a4e655178592532424d6e3263624151667a477a7233516d7171764131536c505461617164253246735739783173515a5a79596f653466336d7831317746454446636d516351322532466b47253246645345386658344a77736d43564c674238564e55253242526325324279776438554b4455766e67625549726170742532425a6225324631394d4350765177565765365242353153576f342532426f70704c4143304c4b25324636393447666f713968545136305361535139746f666541346c6f726f6961435a3133736d6c73335864614a5568456a4949616672494e3954383345464c333859796e4d754a346b4d4b6d25324639312532424b573459346262664c47714d70486b3657744a6b7a6d4774715936433076253246537a4145516e6f456e4d78514454727249746a467166384237684a79736c756b617559504d477a25324263675546367869757a6d754c76494f4c7a4d4c6d683854744564344c36616d6c794f6831744a686c4b726f4f6a4f4d7a4c57757a65453663616b616832757a45536d76467750574f474266643653626472386570514f4246616436365a3375665135576a426e4c5835542532464c694347543668644279764e61345078744b4e65572532464f6a4f755448334d354d54315a56462532426472546f7049397a4f667351543876553163524331644c776f754657576a4b5955533930426f6130474f7452727638744347253242786d54725263527939707749486a3759624864355825324639383749507a4778355a6358517a7049664a5a636e5567524133356853465074444f57315948563736507869626f5a795a51664573433137572532465a5469437474536d4e39674b527635725950683138497761784652636f34364a2532464b586c61496b57734e676b715337333579253242444262546a53784947664a50542532427153703552506a466a253242307156676650532532426c42546b7a706657765463766c6b4951363170587a75332532464f57482532424a4e664f634165315433342532464863464e536848557763485467774a624850414234536174626d4a6873253242456f5679355173595536334e5731554b3061576a49686525324278717352415174736c33487925324253754572385330756476617a54746a45754458483538556a77694e6e3574443277444b734661677152564653795468564c6b56623279793474457641637669526548522532427a6d6c793547455941496973327635683432466b636c55696365253246744b627a572532466c5267694358705a4a527054756d362532424569656f63305139647a253246757766484944466c35506b634371724c5a69656a7348616242486f56375952537176323367736b4644385772354a41544f6830427058335a56506d454a6144727a5047553237253246375031766f55395367454d46354675767a6f6a4a4d64735649756b5056676a5059564f7036416c6e4f70595a38436b25324653724537584b414b4b71794b576f62787959713033524843374779616f503776765432446b4c754f796f69253246695957374d3434702532466450646b776837636d742532467076674752444d396131354d494b6973793052373964356155727a32554e4e576668526d4e684241325836656d50496f43764666253246723250774c37306f5972623565592532424e4b746335774f374f6e5a416f53306c55534f35334f507a7426706167653d68747470732533412532462532467777772e6c6174616d2e636f6d25324670745f6272253246617070732532466d756c7469706c7573253246626f6f6b696e672533466170706c69636174696f6e2533446c616e7061737325323666726f6d5f636974793125334453414f253236746f5f636974793225334453414f253236746f5f63697479312533444e594325323666726f6d5f63697479322533444e59432532366665636861315f64696125334431372532366665636861315f616e6f6d6573253344323031382d31312532366665636861325f64696125334432342532366665636861325f616e6f6d6573253344323031382d31312532366964615f7675656c74612533446964615f7675656c74612532366e6164756c7473253344312532366e6368696c6472656e253344302532366e696e66616e747325334430253236636162696e612533445926747970653d4c4626666c6f7749643d34346361313431312d316362372d346162382d393564652d356238656263306264623332222c2273696c7665726c6967687456657273696f6e223a224e2f41222c22757365724167656e74223a224d6f7a696c6c612f352e30202857696e646f7773204e5420362e313b2057696e36343b2078363429204170706c655765624b69742f3533372e333620284b48544d4c2c206c696b65204765636b6f29204368726f6d652f37302e302e333533382e3737205361666172692f3533372e3336222c2276656e646f72223a22476f6f676c6520496e632e222c22776562676c4650223a223966653236653136643036343932666137313464363262336562393038366163222c227468656d6573223a224e2f41222c22696e636f676e69746f223a66616c73652c22666f6e74734a5332223a5b2241444f4245204341534c4f4e2050524f222c2241444f424520474152414d4f4e442050524f222c22416861726f6e69222c22416e64616c7573222c22416e6773616e61204e6577222c22416e6773616e61555043222c2241706172616a697461222c22417261626963205479706573657474696e67222c22417269616c222c22417269616c20426c61636b222c22417269616c204e6172726f77222c22426174616e67222c22426174616e67436865222c2242726f77616c6c6961204e6577222c2242726f77616c6c6961555043222c2243616c69627269222c2243616d62726961222c2243616d62726961204d617468222c2243616e64617261222c22436f6d69632053616e73204d53222c22436f6e736f6c6173222c22436f6e7374616e746961222c22436f7262656c222c22436f72646961204e6577222c22436f72646961555043222c22436f7572696572222c22436f7572696572204e6577222c2244464b61692d5342222c224461756e50656e68222c224461766964222c2244696c6c656e6961555043222c22446f6b4368616d7061222c22446f74756d222c22446f74756d436865222c22456272696d61222c22457563726f736961555043222c2245757068656d6961222c2246616e67536f6e67222c224672616e6b527565686c222c2246726565736961555043222c2247616272696f6c61222c2247617574616d69222c2247656f72676961222c224769736861222c2247756c696d222c2247756c696d436865222c2247756e67737568222c2247756e67737568436865222c2248656c766574696361222c22496d70616374222c2249726973555043222c2249736b6f6f6c6120506f7461222c224a61736d696e65555043222c224b61695469222c224b616c696e6761222c224b617274696b61222c224b686d6572205549222c224b6f64636869616e67555043222c224b6f6b696c61222c224c616f205549222c224c61746861222c224c65656c617761646565222c224c6576656e696d204d54222c224c696c79555043222c224c756369646120436f6e736f6c65222c224c75636964612053616e7320556e69636f6465222c224d5320476f74686963222c224d53204d696e63686f222c224d532050476f74686963222c224d5320504d696e63686f222c224d532053616e73205365726966222c224d53205365726966222c224d5320554920476f74686963222c224d5620426f6c69222c224d59524941442050524f222c224d616c67756e20476f74686963222c224d616e67616c222c224d61726c657474222c224d656972796f222c224d656972796f205549222c224d6963726f736f66742048696d616c617961222c224d6963726f736f6674204a68656e67486569222c224d6963726f736f6674204e657720546169204c7565222c224d6963726f736f66742050686167735061222c224d6963726f736f66742053616e73205365726966222c224d6963726f736f667420546169204c65222c224d6963726f736f667420556967687572222c224d6963726f736f6674205961486569222c224d6963726f736f6674205969204261697469222c224d696e674c6955222c224d696e674c69552d45787442222c224d696e674c69555f484b534353222c224d696e674c69555f484b5343532d45787442222c224d696e696f6e2050726f222c224d697269616d222c224d697269616d204669786564222c224d6f6e676f6c69616e204261697469222c224d6f6f6c426f72616e222c224e53696d53756e222c224e61726b6973696d222c224e79616c61222c22504d696e674c6955222c22504d696e674c69552d45787442222c2250616c6174696e6f204c696e6f74797065222c22506c616e746167656e657420436865726f6b6565222c225261617669222c22526f64222c2253616b6b616c204d616a616c6c61222c225365676f65205072696e74222c225365676f6520536372697074222c225365676f65205549222c225365676f65205549204c69676874222c225365676f652055492053656d69626f6c64222c225365676f652055492053796d626f6c222c2253686f6e61722042616e676c61222c22536872757469222c2253696d486569222c2253696d53756e222c2253696d53756e2d45787442222c2253696d706c696669656420417261626963222c2253696d706c696669656420417261626963204669786564222c2253796c6661656e222c225461686f6d61222c2254696d6573222c2254696d6573204e657720526f6d616e222c22547261646974696f6e616c20417261626963222c22547265627563686574204d53222c2254756e6761222c22557473616168222c2256616e69222c2256657264616e61222c2256696a617961222c225672696e6461222c2257696e6764696e6773225d2c22666f6e74734a53223a5b22417269616c222c22417269616c20426c61636b222c22417269616c204e6172726f77222c2243616c69627269222c2243616d62726961222c2243616d62726961204d617468222c22436f6d69632053616e73204d53222c22436f6e736f6c6173222c22436f7572696572222c22436f7572696572204e6577222c2247656f72676961222c2248656c766574696361222c22496d70616374222c224c756369646120436f6e736f6c65222c224c75636964612053616e7320556e69636f6465222c224d5320476f74686963222c224d532050476f74686963222c224d532053616e73205365726966222c224d53205365726966222c224d59524941442050524f222c224d6963726f736f66742053616e73205365726966222c2250616c6174696e6f204c696e6f74797065222c225365676f65205072696e74222c225365676f6520536372697074222c225365676f65205549222c225365676f65205549204c69676874222c225365676f652055492053656d69626f6c64222c225365676f652055492053796d626f6c222c225461686f6d61222c2254696d6573222c2254696d6573204e657720526f6d616e222c22547265627563686574204d53222c2256657264616e61222c2257696e6764696e6773225d2c22657874656e73696f6e73223a7b2264656661756c74223a5b5d2c22706f70756c6172223a5b5d2c2273757370656374223a5b5d2c22646576656c6f706572223a5b5d7d2c22617564696f4650223a226637653831303062656133326435333964643530636635663733313630336166227d2c226e6574776f726b223a7b22636f6e6e656374696f6e223a7b22646f776e6c696e6b223a372e372c22646f776e6c696e6b4d6178223a6e756c6c2c2265666665637469766554797065223a223467222c22727474223a3130302c2274797065223a2265746865726e6574227d2c2274696d655a6f6e65223a222d313830222c22696e7465726e616c4950223a223139322e3136382e32352e313433222c2267656f6c6f636174696f6e223a7b226c61746974756465223a302c226c6f6e676974756465223a302c226163637572616379223a307d7d2c226f73223a7b22686173223a7b226c6965644f73223a66616c73652c226c6965645265736f6c7574696f6e223a66616c73657d2c22617564696f537461636b496e666f223a2234343130305f325f315f305f325f6578706c696369745f737065616b657273222c22617661696c61626c6553637265656e5265736f6c7574696f6e223a22313932302c31303530222c22637075436c617373223a22756e6b6e6f776e222c2267726170686963426f617264223a22476f6f676c652053776966745368616465727c476f6f676c6520496e632e222c226d656d6f7279223a22384742222c226e756d6265724f66435055436f726573223a342c22706c6174666f726d223a2257696e3332222c2273637265656e5265736f6c7574696f6e223a22313932302c31303830222c22746f756368537570706f7274223a7b226d6178546f756368506f696e7473223a302c22746f7563684576656e74223a66616c73652c22746f7563685374617274223a66616c73657d2c226d6564696144657669636573223a5b22617564696f696e7075743a222c22617564696f696e7075743a222c22617564696f696e7075743a222c22617564696f696e7075743a222c22617564696f696e7075743a222c22766964656f696e7075743a222c22617564696f6f75747075743a222c22617564696f6f75747075743a222c22617564696f6f75747075743a222c22617564696f6f75747075743a225d2c2262617474657279223a7b226368617267696e67223a747275652c226368617267696e6754696d65223a224e2f41222c226469736368617267696e6754696d65223a22496e66696e697479222c226c6576656c223a317d7d7d',
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

async function getAccountBalance(req) {
    var accounts = "nome,cpf,senha\n";
    accounts = accounts.split("\n");

    var map = {};
    var pSession = Proxy.createSession('latam');
    debugger;

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

    for (let row of accounts) {
        try {
            pSession = Proxy.createSession('latam');

            var name = row.split(',')[0].trim();
            var login = row.split(',')[1].trim();
            var password = row.split(',')[2].trim();

            if (!name || !login || !password) {
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
                    }
                }
            });

            var authToken = getAuthTokenFromBody(loginRes);
            var loginRedirectUrl = getRedirectUrlFromBody(loginRes);

            var redirectedLoginRes = await Proxy.require({
                session: pSession,
                request: {
                    url: loginRedirectUrl,
                    resolveWithFullResponse: true
                }
            });

            var header = null;
            for (let h of redirectedLoginRes.headers['set-cookie']) {
                if (h.indexOf('user_data') !== -1) {
                    header = h;
                    break;
                }
            }

            var info = decodeURIComponent(header).split(';');
            for (let i of info) {
                if (Number(i)) {
                    map[name] = Number(i);
                }
            }

            Proxy.killSession(pSession);

            if (map[name] === undefined || map[name] === null) {
                console.log('erro: ' + row);
                continue;
            }
            console.log(name + ': ' + map[name]);
        } catch (e) {
            console.log('erro: ' + row);
        }
    }

    debugger;

}