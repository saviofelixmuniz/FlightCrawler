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
            departureDate: req.query.departureDate,
            returnDate: req.query.returnDate,
            originAirportCode: req.query.originAirportCode,
            destinationAirportCode: req.query.destinationAirportCode,
            originCountry: req.query.originCountry || 'BR',
            destinationCountry: req.query.destinationCountry || 'BR',
            forceCongener: false,
            infants: 0,
            executive: req.query.executive === 'true'
        };

        /*if (await PreFlightServices(params, START_TIME, 'star-aliance', res)) {
            return;
        }*/

        const page = await makeRequests(params, START_TIME, res);
        //if (!aviancaResponse || !aviancaResponse.amigoResponse || !aviancaResponse.jsonResponse) return;
        var redeemResponse = await extractInfoFlights(page, params);
        console.log(redeemResponse);
        /*Formatter.responseFormat(redeemResponse, null, params, 'starAliance').then(async function (formattedData) {
            console.log("...", formattedData);
        });*/

    } catch (err) {
        console.log(">>>> erro", err);
        //errorSolver.solveFlightInfoErrors('avianca', err, res, START_TIME, params);
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
    const browser = await puppeteer.launch({headless: false});
    const page = await browser.newPage();
    await page.goto('https://www.pontosamigo.com.br/', {waitUntil: 'load', timeout: 0});

    const star_aliance_tab = "#tab-star";
    await page.click(star_aliance_tab);

    //Airports
    console.log("departure airports");
    await page.waitFor(3000);
    const inputStar = "#origem-star";
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
    let depDate = new Date(searchParams.departureDate);

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
                if(column.children[0].children[0].data == depDate.getDate() && indexRow == -1 && indexColumn == -1){
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

        let returnDate = new Date(searchParams.returnDate);
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
                    if(column.children[0].children[0].data == returnDate.getDate() && indexRow == -1 && indexColumn == -1){
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
    await page.type(loginEmail, "74221172657", {delay: 10});

    const passwordEmail = "#input-password-modal";
    await page.type(passwordEmail, "Peidei2@18", {delay: 10});

    const buttonLogin = "#btn-continuar";
    await page.click(buttonLogin);

    console.log("loading page");

    const menuSecondPage = "#container > table > tbody > tr:nth-child(1) > td.layoutTop > div";
    await page.waitForSelector(menuSecondPage, {visible: true, timeout: 0});

    console.log("loaded page");
    return page;
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
    paramDate = paramDate || new Date();
    if(paramDate.getFullYear() === compareDate.getFullYear()){
        return compareDate.getMonth() - paramDate.getMonth();
    } else {
        let acum = 11 - paramDate.getMonth();
        return acum + compareDate.getMonth() + 1;
    }
}

async function extractInfoFlights(page, params){
    html = await page.evaluate(() => document.body.innerHTML);
    $ = cheerio.load(html);
    console.log("Formatting data");

    var flights = {going: [], returning: []};
    var tbody = $('tbody','#fpcTableFareFamilyContent_out');
    console.log(typeof tbody.children());
    tbody.children().each(function () {
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
        let departureTime = flightInfo.eq(0).children().eq(0).text().trim().split(":");
        //REVER ESSA DATA AQUI
        let dateDepFormatted = new Date(params.departureDate);
        dateDepFormatted.setHours(departureTime[0], departureTime[1]);

        let arriveTime = flightInfo.eq(1).children().eq(0).text().trim().split(":");
        let dateArrFormatted = new Date(DEPARTURE_DATE);
        dateArrFormatted.setHours(arriveTime[0], arriveTime[1]);

        if(parseInt(arriveTime[0]) < parseInt(departureTime[0]))
            dateArrFormatted.setDate(dateArrFormatted.getDate()+1);

        let departureAirport = flightInfo.eq(0).children().eq(1).text().trim();
        departureAirport = departureAirport.substring(departureAirport.indexOf('(')+1,
            departureAirport.indexOf(')'));
        let arriveAirport = flightInfo.eq(1).children().eq(1).text().trim();
        arriveAirport = arriveAirport.substring(arriveAirport.indexOf('(')+1,
            arriveAirport.indexOf(')'));

        let connections = extractConnections(flightInfo.eq(0).children().eq(2).text().replace(/\s/g, ''));

        if(connections.length > 1){
            connections = extractInfoConnection(page, params);
        }

        let flight = {
            departureAirport : departureAirport,
            arriveAirport: arriveAirport,
            departureTime: dateDepFormatted,
            arriveTime: dateArrFormatted,
            numberConnections: connections.length -1,
            connections: connections,
            miles: []
        };


        if (!flights.going[connections.join('')])
            flights.going[connections.join('')] = flight;
        if (miles) {
            flights.going[connections.join('')]['miles'].push(miles);
        }
        if (miles2) {
            flights.going[connections.join('')]['miles'].push(miles2);
        }
        console.log(flight, flights)
    });

    if(params.returnDate){
        console.log("return");
        var tbody = $('tbody','#fpcTableFareFamilyContent_in');
        tbody.children().each(function () {
            console.log(">>>>>")
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
            let departureTime = flightInfo.eq(0).children().eq(0).text().trim().split(":");
            //REVER ESSA DATA AQUI
            let dateDepFormatted = new Date(params.departureDate);
            dateDepFormatted.setHours(departureTime[0], departureTime[1]);

            let arriveTime = flightInfo.eq(1).children().eq(0).text().trim().split(":");
            let dateArrFormatted = new Date(DEPARTURE_DATE);
            dateArrFormatted.setHours(arriveTime[0], arriveTime[1]);

            if(parseInt(arriveTime[0]) < parseInt(departureTime[0]))
                dateArrFormatted.setDate(dateArrFormatted.getDate()+1);

            let departureAirport = flightInfo.eq(0).children().eq(1).text().trim();
            departureAirport = departureAirport.substring(departureAirport.indexOf('(')+1,
                departureAirport.indexOf(')'));
            let arriveAirport = flightInfo.eq(1).children().eq(1).text().trim();
            arriveAirport = arriveAirport.substring(arriveAirport.indexOf('(')+1,
                arriveAirport.indexOf(')'));

            let connections = extractConnections(flightInfo.eq(0).children().eq(2).text().replace(/\s/g, ''));

            if(connections.length > 1){
                connections = extractInfoConnection(page, params);
            }

            let flight = {
                departureAirport : departureAirport,
                arriveAirport: arriveAirport,
                departureTime: dateDepFormatted,
                arriveTime: dateArrFormatted,
                numberConnections: connections.length -1,
                connections: connections,
                miles: []
            };


            if (!flights.going[connections.join('')])
                flights.going[connections.join('')] = flight;
            if (miles) {
                flights.going[connections.join('')]['miles'].push(miles);
            }
            if (miles2) {
                flights.going[connections.join('')]['miles'].push(miles2);
            }
            console.log(flight, flights)
        });

    }
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

async function extractInfoConnection(page, searchParams) {
    console.log("formatting connection")
    var connectionHTML = await page.evaluate(() => document.body.innerHTML);
    $ = cheerio.load(connectionHTML);
    var flights = [];
    var quantityFlight = -1;

    const tbody = $('tbody','#tabFgtReview_0');
    tbody.children().each(function(index){
        var tr = $(this);
        var infoTable = tr.find('td table tbody tr td table tbody');
        if(infoTable.length === 0 )return;
        quantityFlight ++;
        let departureInforms = infoTable.eq(0).children().eq(0).text().trim()
            .replace(/\n/g, '').replace(/\t/g, '').replace(/\s\s\s/g, '').replace('Partida:', '');
        let dateDeparture = departureInforms.substr(0, 5).split(":");
        let endCityIndex = (departureInforms.indexOf("terminal") === -1)?  departureInforms.length :  departureInforms.indexOf("terminal") -7;
        let cityDeparture = departureInforms.substr(5, endCityIndex);
        let dateDepFormatted = new Date(DEPARTURE_DATE);
        //ESTÁ SETANDO COM +3
        dateDepFormatted.setHours(dateDeparture[0], dateDeparture[1]);


        //Arrive Information

        let arriveInforms = infoTable.eq(0).children().eq(1).text().trim()
            .replace(/\n/g, '').replace(/\t/g, '').replace(/\s\s\s/g, '').replace('Chegada:', '');
        let dateArrive = arriveInforms.substr(0, 5).split(":");
        let moreDayDepature = arriveInforms.indexOf("+1  dia(s)") !== -1;
        let startCityIndex = (moreDayDepature) ? 15 : 5 ;
        endCityIndex = (arriveInforms.indexOf("terminal") === -1)?  arriveInforms.length :  arriveInforms.indexOf("terminal") -7;
        let cityArrive = arriveInforms.substr(startCityIndex, endCityIndex);
        let dateArrFormatted = new Date(DEPARTURE_DATE);
        console.log(dateArrFormatted);
        (moreDayDepature) && dateArrFormatted.setDate(dateArrFormatted.getDate() +1);
        console.log(dateArrFormatted, dateArrive);
        dateArrFormatted.setHours(dateArrive[0], dateArrive[1]);

        let numberFlight = tr.find('#segAircraft_0_'+quantityFlight).text().trim().split(" ");
        numberFlight = numberFlight[numberFlight.length -1];

        flight = {
            "NumeroVoo": numberFlight,
            "Origem": cityDeparture,
            "Embarque": dateDepFormatted,
            "Destino": cityArrive,
            "Desembarque": dateArrFormatted,
            "Duracao": msToTime(dateArrFormatted - dateDepFormatted)
        };
    });
}

function msToTime(duration) {
    var minutes = parseInt((duration / (1000 * 60)) % 60),
        hours = parseInt((duration / (1000 * 60 * 60)) % 24);

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;

    return hours + ":" + minutes;
}