var cheerio = require('cheerio');
var request = require('request-promise');

module.exports = search;
async function search(params) {
    var cookiejar = request.jar();

    let url_params = `&Adultos=${params.adults}&Criancas=${params.children}&Bebes=0` +
        `&Origem=${params.originAirportCode}&Destino=${params.destinationAirportCode}&Tipo=${ !params.returnDate ? '1' : '2' }`+
        `&DataVolta${formatDate(params.returnDate)}&DataIda=${formatDate(params.departureDate)}`;
    // console.log(url_params)
    let url = 'https://portaldoagente.com.br/OnlineTravelFrameMVC/Aereo/Disponibilidade?LojaChave=U1JNVklBR0VOUw==' + url_params;
    let response = await request.get({url: url, jar: cookiejar, headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36'
    }});

    var $ = cheerio.load(response);
    let token = $('#campo_pesquisa_aerea_controle_id').attr('value');

    console.log('confianca token')
    let url_search = 'https://portaldoagente.com.br/OnlineTravelFrameMVC/Aereo/RecuperarResultados';
    let json = {};
    while (Object.keys(json).length < 4) {

        let a = await request.post({url: url_search, jar: cookiejar, formData: { 'FiltoDeBagagem': '', 'ControleID': token }, headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36',
            'Referer': url,
            'Content-Type': 'application/x-www-form-urlencoded'
        }});

        let array = JSON.parse(a).resultados;
        for(let i in array) {
            if(array[i].NomeSistema != null) {
                json[array[i].NomeSistema] = {};
                console.log(array[i].NomeSistema + ' => ok ' + array[i].Viagens.length);

                for(let a in array[i].Viagens){
                    let value = null;
                    for(let c in array[i].Viagens[a].voos[0].Classes) {
                        if(array[i].Viagens[a].voos[0].Classes[c].ValorControleAdulto.Valores[0].Moedas[0].view.Exibicao_TotalNET.ValorTotalizadoGeral < value || value == null) {
                            value = array[i].Viagens[a].voos[0].Classes[c].ValorControleAdulto.Valores[0].Moedas[0].view.Exibicao_TotalNET.ValorTotalizadoGeral;
                        }
                    }

                    json[array[i].NomeSistema][array[i].Viagens[a].VooInicial + array[i].Viagens[a].Fim.Hora.substr(0, 5)] = { child: value, adult: value };
                }
            }
        }
    }

    return json;
}

function formatDate(date) {
    if(!date) return '';
    return date.split('-')[2] + '/' + date.split('-')[1] + '/' + date.split('-')[0];
}
