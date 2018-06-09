/**
 * @author Sávio Muniz
 */

module.exports = {
    UNREACHABLE : 'Could not retrieve data from the company',
    PARSE_ERROR : 'Retrieved data is different from what is expected',
    CRITICAL : 'This error should not happen in any case',
    UNAVAILABLE :  'No flights available on the chosen date',
    PROXY_ERROR: 'Proxy error. This might happen sometimes due to Storm Proxies instability. If this error is happening too many times it means something is wrong at Storm Proxies, check DNS.',
    ERROR_RATE_MESSAGE: function errorRateMessageFormat(company, errorRate) {
        return `Olá,<br><br>
                A companhia <strong>${company}</strong> está com uma taxa de erro preocupante. 
                Na última hora <strong>${(errorRate * 100).toFixed(2)}%</strong> das requisições falharam.<br><br>
                Favor entrar em contato com os desenvolvedores para que o problema possa ser resolvido.<br><br>
                FlightServer`;
    }

};