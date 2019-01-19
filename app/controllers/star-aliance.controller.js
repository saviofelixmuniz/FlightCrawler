/**
 * @author Maiana Brito
 */
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const errorSolver = require("../util/helpers/error-solver");
const db = require('../util/services/db-helper');
const Formatter = require('../util/helpers/format.helper');
const PreFlightServices = require('../util/services/preflight');

module.exports = {getFlightInfo: getFlightInfo, getTax: getTax};

async function getFlightInfo(req, res, next) {
    const START_TIME = (new Date()).getTime();

    console.log('Searching Star Aliance...');
    try {
        var params = {
            IP: req.clientIp,
            client: req.clientName || "",
            api_key: req.headers['authorization'],
            adults: req.query.adults,
            children: req.query.children,
            departureDate: (req.query.departureDate),
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            originCountry: req.query.originCountry || 'BR',
            destinationCountry: req.query.destinationCountry || 'BR',
            forceCongener: false,
            infants: 0,
            executive: req.query.executive === 'true'
        };

        if (await PreFlightServices(params, START_TIME, 'star-aliance', res)) {
            return;
        }

        const page = await makeRequests(params, START_TIME, res);
        //if (!aviancaResponse || !aviancaResponse.amigoResponse || !aviancaResponse.jsonResponse) return;
        var redeemResponse = await extractInfoFlights(page.page, params, page.browser);
        //console.log(redeemResponse);
        Formatter.responseFormat(redeemResponse, null, params, 'starAliance').then(async function (formattedData) {
            //var resources = formattedData.resources;
            //delete formattedData.resources;
            //var request = await db.saveRequest('star-aliance', (new Date()).getTime() - START_TIME, params, null, 200, formattedData);
            //await db.saveRequestResources(request._id, null, null, resources);
            res.status(200);
            //res.json({results: formattedData, id: request._id});
            res.json({results: formattedData});
        });

    } catch (err) {
        console.log(">>>> erro", err);
        errorSolver.solveFlightInfoErrors('avianca', err, res, START_TIME, params);
    }
}

function makeRequests(params, startTime, res) {
    return getStarAlianceResponse(params);
    /*return Promise.all([getStarAlianceResponse(params, startTime, res)]).then(function (page) {
        /*if (results[0].err) {
            throw {err : true, code : results[0].code, message : results[0].message, stack : results[0].stack};
        }
        if (results[1].err) {
            throw {err : true, code : results[0].code, message : results[0].message, stack : results[0].stack};
        }
        return {jsonResponse: results[0], amigoResponse: results[1]};
        return page
    });*/
}

async function getStarAlianceResponse(searchParams) {
    const browser = await puppeteer.launch({headless: false, args: ['--proxy-server=zproxy.lum-superproxy.io:22225']});
    const page = await browser.newPage();
    await page.authenticate({
        username: 'lum-customer-incodde-zone-enhancement_test-country-us',
        password: 'pfts1zhv36n1'
    })
    await page.goto('https://www.pontosamigo.com.br/', {waitUntil: 'load', timeout: 0});

    const star_aliance_tab = "#tab-star";
    await page.click(star_aliance_tab);

    if(parseInt(searchParams.adults) > 1 || parseInt(searchParams.infants) > 0 || parseInt(searchParams.children) > 0){
        console.log("passageiros");
        const passengers = "#star-aliance > div:nth-child(1) > div.box-dropdown-loja.drop-passageiros.pull-left > button > span";
        await page.waitForSelector(passengers, {visible: true, timeout: 0});
        await page.click(passengers);
        await page.waitFor(2000);

        console.log("box passagers");

        if(parseInt(searchParams.adults) > 1 ){
            const adult = "#star-aliance > div:nth-child(1) > div.box-dropdown-loja.drop-passageiros.pull-left.open > ul >" +
                            " li:nth-child(2) > div > div.col-xs-7.controller > button.btn-amigo.mais";
            await page.waitForSelector(adult, {visible: true, timeout: 0});
            for (i = 1; i < parseInt(searchParams.adults); i++) {
                await page.click(adult);
                await page.waitFor(2000);
            }
        }

        if(parseInt(searchParams.children) > 0){
            const children = "#star-aliance > div:nth-child(1) > div.box-dropdown-loja.drop-passageiros.pull-left.open > ul >" +
                                " li:nth-child(3) > div > div.col-xs-7.controller > button.btn-amigo.mais";
            for (i = 0; i < parseInt(searchParams.children); i++) {
                await page.click(children);
                await page.waitFor(2000);
            }
        }

        if(parseInt(searchParams.infants) > 0){
            const baby = "#star-aliance > div:nth-child(1) > div.box-dropdown-loja.drop-passageiros.pull-left.open > ul >" +
                            " li:nth-child(4) > div > div.col-xs-7.controller > button.btn-amigo.mais";
            for(i = 0; i < parseInt(searchParams.infants); i++) {
                await page.click(baby);
                await page.waitFor(2000);
            }
        }
    }

    //Airports
    console.log("departure airports");
    await page.waitFor(3000);
    const inputStar = "#origem-star";
    await page.click(inputStar);
    await page.type(inputStar, searchParams.originAirportCode, {delay: 10});

    let bodyHTML = await page.evaluate(() => document.body.innerHTML);
    let $ = cheerio.load(bodyHTML);
    $("#lista-cidades-origem-star").children().children().map(
        async function(index, element){
            let airport = element.children[0].attribs["data-iatacode"];
            if(airport === searchParams.originAirportCode){
                const selectAirport = "#lista-cidades-origem-star > ul > li:nth-child("+(index+1)+") > a";
                await page.click(selectAirport);
            }
        }
    );

    await page.waitFor(5000);
    const div = "#portlet_com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_PSZDBJxfm2Ao > div > div > div >" +
                " div.journal-content-article > section > div > div > div > div";
    await page.click(div);


    console.log("destination airport");
    await page.waitFor(2000);
    const inputEnd = "#destino-star";
    await page.click(inputEnd);
    await page.waitFor(2000);

    await page.type(inputEnd, searchParams.destinationAirportCode, {delay: 10});

    bodyHTML = await page.evaluate(() => document.body.innerHTML);
    $ = cheerio.load(bodyHTML);
    $("#lista-cidades-destino-star").children().children().map(
        async function(index, element){
            let airport = element.children[0].attribs["data-iatacode"];
            if(airport === searchParams.destinationAirportCode){
                const selectOriginAirport = "#lista-cidades-destino-star > ul > li:nth-child("+(index+1)+") > a";
                await page.click(selectOriginAirport);
                await page.waitFor(7000);
            }
        }
    );

    // Departure date
    let depDate = (searchParams.departureDate).split("-");

    console.log("departure date");
    await page.waitFor(2000);
    const inputDateStar = "#ida-e-volta-star > div.row > div.box-ida.col-md-6.pull-left > input";
    await page.click(inputDateStar);
    let time = timeClickNext(depDate);
    await page.waitFor(2000);
    if(time > 0){
        for (i = 0; i < time; i++) {
            const next = "#parent-calendar-star > div > div.calendar.left.single > div.calendar-table > table > " +
                "thead > tr:nth-child(2) > th.next.available";
            await page.waitForSelector(next, {visible: true, timeout: 0});
            await page.click(next);
        }
    }

    let indexRow = -1;
    let indexColumn = -1;
    bodyHTML = await page.evaluate(() => document.body.innerHTML);
    $ = cheerio.load(bodyHTML);
    $("div.calendar-table table tbody").children().map(
        function(i, row){
            return row.children.map(async function (column, j){
                if(column.children[0].children[0].data == depDate[2] && indexRow == -1 && indexColumn == -1){
                    indexRow = parseInt(column.attribs['data-title'][1]) + 1;
                    indexColumn = parseInt(column.attribs['data-title'][3]) +1;
                }
            })
        }
    );
    const date = "#parent-calendar-star > div > div.calendar.left.single > div.calendar-table > table > tbody > " +
                "tr:nth-child("+indexRow+") > td:nth-child("+indexColumn+")";
    await page.click(date);
    await page.waitFor(2000);

    if(searchParams.returnDate){
        console.log("return date");
        let returnDate = searchParams.returnDate.split("-");
        const inputReturnDate = "#ida-e-volta-star > div.row > div.box-volta.col-md-6.pull-right > input";
        await page.click(inputReturnDate);
        await page.waitFor(2000);
        time = timeClickNext(returnDate, depDate);
        if(time > 0){
            for (i = 0; i < time; i++) {
                const next = "#parent-calendar-star > div > div.calendar.left.single > div.calendar-table > table > " +
                            "thead > tr:nth-child(2) > th.next.available";
                await page.waitForSelector(next, {visible: true, timeout: 0});
                await page.click(next);
            }
        }

        indexRow = -1;
        indexColumn = -1;
        bodyHTML = await page.evaluate(() => document.body.innerHTML);
        $ = cheerio.load(bodyHTML);
        $("div.calendar-table table tbody").children().map(
            function(i, row){
                return row.children.map(async function (column, j){
                    if(column.children[0].children[0].data == returnDate[2] && indexRow == -1 && indexColumn == -1){
                        indexRow = parseInt(column.attribs['data-title'][1]) + 1;
                        indexColumn = parseInt(column.attribs['data-title'][3]) +1;
                    }
                })
            }
        );
        const dateEnd = "#parent-calendar-star > div > div.calendar.left.single > div.calendar-table > table > " +
                        "tbody > tr:nth-child("+indexRow+") > td:nth-child("+ indexColumn+")";
        await page.click(dateEnd);
    }

    console.log("make search");
    await page.waitFor(5000);
    const buttonSearch = "#star-aliance > div.row-content.mobile-border > div.row.buscar-voo > div > button";
    await page.waitForSelector(buttonSearch, {visible: true, timeout: 0});
    await page.click(buttonSearch);

    await page.waitFor(2000);

    console.log("login");
    //LOGIN
    const loginEmail = "#input-login-modal";
    await page.type(loginEmail, "12144504407", {delay: 10});

    const passwordEmail = "#input-password-modal";
    await page.type(passwordEmail, "CCfederal03", {delay: 10});

    const buttonLogin = "#btn-continuar";
    await page.click(buttonLogin);

    console.log("loading page");

    const menuSecondPage = "#container > table > tbody > tr:nth-child(1) > td.layoutTop > div";
    await page.waitForSelector(menuSecondPage, {visible: true, timeout: 0});
    await page.waitFor(2000);

    console.log("loaded page");
    // MUDAR ISSO
    return {page: page, browser: browser };
}

async function getTax(req, res, next) {
    try {
        var requestResources = await db.getRequestResources(req.query.requestId);
        if (!requestResources) {
            res.status(500);
            return;
        }
        var id = (req.query.goingFareId && req.query.returningFareId) ? req.query.goingFareId + '_' + req.query.returningFareId :
            (req.query.goingFareId ? req.query.goingFareId : req.query.returningFareId);
        res.json({tax: requestResources.resources[id].tax});
    } catch (err) {
        res.status(500).json({error : err.stack});
    }
}

function timeClickNext(compareDate, paramDate){
    paramDate = paramDate || (new Date()).toISOString().split("T")[0].split("-");
    if(paramDate[0] === compareDate[0]){
        return compareDate[1] - paramDate[1];
    } else {
        let acum = 11 - paramDate[1];
        return acum + compareDate[1] + 1;
    }
}

async function extractInfoFlights(page, params, browser){
    html = await page.evaluate(() => document.body.innerHTML);
    $ = cheerio.load(html);
    console.log("Extracting info");

    var flights = {going: [], returning: []};
    var tbody = $('tbody','#fpcTableFareFamilyContent_out');
    tbody.children().each(async function (index) {
        var tr = $(this);
        var miles = tr.find('td.col2');
        var miles2 = tr.find('td.col3');
        if (miles.length === 0 && miles2.length === 0)
            return;

        var splitPointsArray = miles.text().split(' Pontos')[0].split('\n');
        miles = Number(splitPointsArray[splitPointsArray.length - 1].trim());

        if (miles2.length > 0) {
            splitPointsArray = miles2.text().split(' PontformattedDepos')[0].split('\n');
            miles2 = Number(splitPointsArray[splitPointsArray.length - 1].trim());
        } else {
            miles2 = null;
        }

        var flightInfo = tr.find('.col1').find('.tableFPCFlightDetails').find('tr');

        let departureTime = flightInfo.eq(0).children().eq(0).text().trim();
        let dateDepFormatted = params.departureDate.split("-");
        let arriveTime = flightInfo.eq(1).children().eq(0).text().trim();

        let departureAirport = flightInfo.eq(0).children().eq(1).text().trim();
        departureAirport = departureAirport.substring(departureAirport.indexOf('(')+1,
            departureAirport.indexOf(')'));
        let arriveAirport = flightInfo.eq(1).children().eq(1).text().trim();

        let moreDay = arriveAirport.indexOf(" dia(s)") !== -1;
        var addDay = 0;

        if(moreDay){
            addDay = parseInt(arriveAirport.substring(arriveAirport.indexOf(" dia(s)")-9,
                arriveAirport.indexOf(" dia(s)")));
        }

        dateArrFormatted = parseInt(dateDepFormatted[2]) + addDay+"/"+dateDepFormatted[1]+"/"+
            dateDepFormatted[0]+ " " +arriveTime;
        dateDepFormatted = dateDepFormatted[2]+"/"+dateDepFormatted[1]+"/"+dateDepFormatted[0]+ " " +departureTime;

        arriveAirport = arriveAirport.substring(arriveAirport.indexOf('(')+1,
            arriveAirport.indexOf(')'));

        let connections = extractConnections(flightInfo.eq(0).children().eq(2).text().replace(/\s/g, ''));
        let connectionsInfo;
        if(connections.length > 1){
            console.log("going")
            Promise.all([getConnection(page, browser, index, params, true)]).then(function sucess(info) {
                connectionsInfo = info;
            });
            console.log(connectionsInfo)
        }

        let flight = {
            departureAirport : departureAirport,
            arriveAirport: arriveAirport,
            departureTime: dateDepFormatted,
            arriveTime: dateArrFormatted,
            numberConnections: connections.length -1,
            connectionsFlightNumber: connections,
            connections: connectionsInfo,
            miles: []
        };

        if (miles) {
            flight.miles.push(miles);
        }
        if (miles2) {
            flight.miles.push(miles2);
        }
        flights.going.push(flight);
    });

    if(params.returnDate){
        var tbody = $('tbody','#fpcTableFareFamilyContent_in');
        tbody.children().each(async function (index) {
            var tr = $(this);
            var miles = tr.find('td.col2');
            var miles2 = tr.find('td.col3');
            if (miles.length === 0 && miles2.length === 0)
                return;

            var splitPointsArray = miles.text().split(' Pontos')[0].split('\n');
            miles = Number(splitPointsArray[splitPointsArray.length - 1].trim());

            if (miles2.length > 0) {
                splitPointsArray = miles2.text().split(' PontformattedDepos')[0].split('\n');
                miles2 = Number(splitPointsArray[splitPointsArray.length - 1].trim());
            } else {
                miles2 = null;
            }

            var flightInfo = tr.find('.col1').find('.tableFPCFlightDetails').find('tr');

            console.log("Flight time");
            let departureTime = flightInfo.eq(0).children().eq(0).text().trim();
            let dateDepFormatted = params.returnDate.split("-");

            let arriveTime = flightInfo.eq(1).children().eq(0).text().trim();

            let departureAirport = flightInfo.eq(0).children().eq(1).text().trim();
            departureAirport = departureAirport.substring(departureAirport.indexOf('(')+1,
                departureAirport.indexOf(')'));
            let arriveAirport = flightInfo.eq(1).children().eq(1).text().trim();

            let moreDay = arriveAirport.indexOf(" dia(s)") !== -1;
            var addDay = 0;

            if(moreDay){
                addDay = parseInt(arriveAirport.substring(arriveAirport.indexOf(" dia(s)")-9,
                    arriveAirport.indexOf(" dia(s)")));
            }

            let dateArrFormatted = parseInt(dateDepFormatted[2]) + addDay+"/"+dateDepFormatted[1]+"/"+
                dateDepFormatted[0]+ " " +arriveTime;
            dateDepFormatted = dateDepFormatted[2]+"/"+dateDepFormatted[1]+"/"+dateDepFormatted[0]+ " " +departureTime;

            arriveAirport = arriveAirport.substring(arriveAirport.indexOf('(')+1,
                arriveAirport.indexOf(')'));

            let connections = extractConnections(flightInfo.eq(0).children().eq(2).text().replace(/\s/g, ''));

            if(connections.length < 1){
                console.log("return info")
                Promise.all([getConnection(page, browser, index, params, false)]).then(function sucess(info) {
                    connectionsInfo = info;
                });
            }

            let flight = {
                departureAirport : departureAirport,
                arriveAirport: arriveAirport,
                departureTime: dateDepFormatted,
                arriveTime: dateArrFormatted,
                numberConnections: connections.length -1,
                connectionsFlightNumber: connections,
                //connections: connectionsInfo,
                miles: []
            };

            if (miles) {
                flight.miles.push(miles);
            }
            if (miles2) {
                flight.miles.push(miles2);
            }
            flights.returning.push(flight);
        });
    }
    console.log(">>>> returning")
    return flights;
}

function extractConnections(connText) {
    var result = [];
    var getting = false;
    var current = '';

    for (var c of connText) {

        if (c === '(') {
            getting = true;
            continue;
        }
        if (c === ')') {
            getting = false;
            result.push(current);
            current = '';
            continue;
        }
        if (getting) {
            current += c;
        }
    }
    return result;
}

async function extractInfoConnection(connectionHTML, searchParams, going) {
    console.log("formatting connection");
    $ = cheerio.load(connectionHTML);
    var flights = [];
    var quantityFlight = -1;

    const tbody = $('tbody','#tabFgtReview_0');
    tbody.children().each(function(){
        var tr = $(this);
        var infoTable = tr.find('td table tbody tr td table tbody');
        if(infoTable.length === 0 )return;
        quantityFlight ++;
        let departureInforms = infoTable.eq(0).children().eq(0).text().trim()
            .replace(/\n/g, '').replace(/\t/g, '').replace(/\s\s\s/g, '').replace('Partida:', '');
        let dateDeparture = departureInforms.substr(0, 5).split(":");
        let endCityIndex = (departureInforms.indexOf("terminal") === -1)?  departureInforms.length :  departureInforms.indexOf("terminal") -7;
        let cityDeparture = departureInforms.substr(5, endCityIndex);

        // REVER ISSO
        let dateDepFormatted = new Date(searchParams.departureDate);
        dateDepFormatted.setHours(dateDeparture[0], dateDeparture[1]);


        //Arrive Information

        let arriveInforms = infoTable.eq(0).children().eq(1).text().trim()
            .replace(/\n/g, '').replace(/\t/g, '').replace(/\s\s\s/g, '').replace('Chegada:', '');
        let dateArrive = arriveInforms.substr(0, 5).split(":");

        //REVER
        let moreDayDepature = arriveInforms.indexOf("dia(s)") !== -1;

        let startCityIndex = (moreDayDepature) ? 15 : 5 ;
        endCityIndex = (arriveInforms.indexOf("terminal") === -1)?  arriveInforms.length :  arriveInforms.indexOf("terminal") -7;
        let cityArrive = arriveInforms.substr(startCityIndex, endCityIndex);


        let dateArrFormatted = new Date(searchParams.departureDate);
        (moreDayDepature) && dateArrFormatted.setDate(dateArrFormatted.getDate() +1);
        dateArrFormatted.setHours(dateArrive[0], dateArrive[1]);

        let numberFlight = tr.find('#segAircraft_0_'+quantityFlight).text().trim().split(" ");
        numberFlight = numberFlight[numberFlight.length -1];

        flight = {
            "NumeroVoo": numberFlight,
            "Origem": cityDeparture,
            "Embarque": dateDepFormatted,
            "Destino": cityArrive,
            "Desembarque": dateArrFormatted,
            //"Duracao": msToTime(dateArrFormatted - dateDepFormatted)
        };
        flights.push(flight);
    });
    return flights;
}

async function getConnection(page, browser, index, params, going) {
    return new Promise(
        async function (resolve, reject) {
            let moreDetails;
            if(index == 0)
                moreDetails = "#fpcFirstTableFlightDetails_out > table > tbody > tr:nth-child(2) > td:nth-child(3) > ul >" +
                    " li:nth-child(5) > a";
            else
                moreDetails = "#upSellCelltoBeSync0_out"+index+" > table > tbody > tr > td > table > tbody > tr:nth-child(2) >" +
                    " td:nth-child(3) > ul > li:nth-child(5) > a"

            await page.click(moreDetails);
            await page.waitFor(5000);

            const pages = await browser.pages();
            const popup = pages[pages.length - 1];
            const connectionHTML = await popup.evaluate(() => document.body.innerHTML);
            var info = await extractInfoConnection(connectionHTML, params, going);
            resolve(info);
        }
    );
}