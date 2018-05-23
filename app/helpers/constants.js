
var Time = require('./time-utils');

exports.AVIANCA_FORM_BASE = {
    DATE_RANGE_QUALIFIER_2:'C',
    BOOKING_FLOW:'REVENUE',
    DATE_RANGE_QUALIFIER_1:'C',
    SO_SITE_AWARD_CONVERTER_MODE:'MILES_AND_CASH',
    SO_SITE_PAY_USE_TFPSCQ:'FALSE',
    EMBEDDED_TRANSACTION:'FlexPricerAvailability',
    SO_SITE_USE_TFPSGQ:'TRUE',
    IS_MILES_MODE:'FALSE',
    SO_SITE_FP_CFF_DIST_OPT:'NAT',
    SO_SITE_MILESANDCASH_LIGHT:'FALSE',
    TRIP_FLOW:'YES',
    COUNTRY:'BR',
    FLX_DATES:true,
    EXTERNAL_ID:'SAO',
    SO_SITE_PUBLISH_MILES_AIRLIN:'O6',
    SO_SITE_USE_MC_PRICING_OPTN:'FALSE',
    DISPLAY_TYPE:'2',
    COMMERCIAL_FARE_FAMILY_1:'ZBR',
    LANGUAGE:'BR',
    ARRANGE_BY:'NDE',
    SITE:'AEDKANEW',
    SO_SITE_PAY_TFPSGQ_VERSION:'16.1',
    pe_variable3:'Domestic',
    SO_SITE_INS_BOOK_BIRTH_REQ:'TRUE',
    MILES_MODE:'FALSE',
    SO_SITE_PAY_USE_TFOPCQ:'TRUE',
    SO_SITE_FD_DISPLAY_MODE:0,
    SO_SITE_FP_FORWARD_RECOS:'TRUE',
    SO_SITE_PAY_TFPICQ_VERSION:'15.3',
    SO_SITE_ENABLE_PREBOOKING:'TRUE',
    SO_SITE_FP_CONVERT_TO_MILES:'TRUE',
    TRIP_TYPE:'R',
    SO_SITE_USE_SLD_FOP_FOR_AWC:'TRUE',
    SO_SITE_FP_PRICING_TYPE:'CITY',
    PRICING_TYPE:'C',
    SO_SITE_OFFICE_ID:'SAOO608AA',
    SOURCE:'DESKTOP_REVENUE',
    SO_SITE_IS_INSURANCE_ENABLED:'TRUE',
    DATE_RANGE_VALUE_1:3,
    DATE_RANGE_VALUE_2:3,
    TRAVELLER_TYPE_1:'ADT',
    SITE2:'AviancaBR'
};

exports.getBaseVoeLegalResponse = function (params, company) {
    var response = {
        results : {
            Status : {
                Alerta : []
            },
            Erro : false,
                Sucesso : true
        }
    };

    var departureDate = new Date(params.departureDate);
    var returnDate = new Date(params.returnDate);
    response["Busca"] = {
        "Criancas" : params.children,
        "Adultos" : params.adults,
        "Trechos" : [
            {
                "DataIda" : Time.formatDate(departureDate),
                "Origem" : params.originAirportCode,
                "DataVolta" : Time.formatDate(returnDate),
                "Destino" : params.destinationAirportCode
            }
        ],
        "Chave" : "df40bb87c05b8fc3385630fff6ca0145d0ca5cda",
        "Senha" : "3d3320991273206dc3154338293178ba776d636b",
        "TipoBusca" : 1,
        "Bebes" : 0,
        "Companhias" : [company]
    };

    response["Trechos"] = {};
    return response;
};

exports.LATAM_TEMPLATE_CHANGE_DATE = getLatamTemplateChangeDate();

function getLatamTemplateChangeDate() {
    var changeDate = new Date();
    changeDate.setFullYear(2018);
    changeDate.setMonth(4);
    changeDate.setDate(11);
    return changeDate;
}

exports.DATABASE = process.env.environment === 'production' ? 'mongodb://incodde:incodde@ds247699.mlab.com:47699/flightserver' : 'mongodb://localhost/flightserver';

exports.PROXY_URL = 'http://173.242.127.163:19013';