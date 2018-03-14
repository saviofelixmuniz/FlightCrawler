/**
 * @author Sávio Muniz
 */
module.exports = getFlightInfo;
const request = require('requestretry');

function getFlightInfo(req, res, next) {
    var url = 'https://viajemais.voeazul.com.br/Search.aspx';

    var headers = {
        Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding':'gzip, deflate, br',
        'Accept-Language':'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
        'Cache-Control':'max-age=0',
        'Connection':'keep-alive',
        'Content-Length':1585,
        'Content-Type':'application/x-www-form-urlencoded',
        'Cookie':'s_fid=0765E08230B3CA20-0EF28E48E684523E; s_getDSLVisit_s=First%20Visit; au_vtid=0765E08230B3CA20-0EF28E48E684523E_1520868992374; _stLang=pt; check=true; _ga=GA1.3.2061982920.1519856742; _gid=GA1.3.515592836.1520827920; cto_lwid=e8cad603-9799-4c00-8543-8a0eadfe8de8; __sonar=10923596659498971947; sticky=two; _st_ses=12107528576729054; _sptid=1434; _spcid=1455; _st_cart_script=helper_voeazul.js; _st_cart_url=/; _st_no_user=1; sback_client=57dad183becd8a522620c05b; sback_partner=false; sback_current_session=1; sback_total_sessions=1; sb_days=1520869007984; sback_customer_w=true; sback_refresh_wp=no; sback_browser=0-68248200-15208690068378e38432f526cd2413fe51c533701b5d5958df8230002755aa69e8ea6a006-46991418-17710203226-1520869043; sback_customer=$2AcxEWRSdlUZdjM3tWcUtkWuRzSZF0VN9UOrFkRUpWUZBVMzF0VURXTvJDNFVDRWpVS3d3ZIpGWO9ka1I1QEhlT2$12; sback_access_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJhcGkuc2JhY2sudGVjaCIsImlhdCI6MTUyMDg2OTA0NCwiZXhwIjoxNTIwOTU1NDQ0LCJhcGkiOiJ2MiIsImRhdGEiOnsiY2xpZW50X2lkIjoiNTdkYWQxODNiZWNkOGE1MjI2MjBjMDViIiwiY2xpZW50X2RvbWFpbiI6InZvZWF6dWwuY29tLmJyIiwiY3VzdG9tZXJfaWQiOiI1YWE2OWU4ZjlkMWI1MDE2MWQwODZjNDQiLCJjdXN0b21lcl9hbm9ueW1vdXMiOnRydWUsImNvbm5lY3Rpb25faWQiOiI1YWE2OWU4ZjlkMWI1MDE2MWQwODZjNDUiLCJhY2Nlc3NfbGV2ZWwiOiJjdXN0b21lciJ9fQ.XNckxxWhtoHKIDGrk_x4Na0Y7or4zJgV105jb5ZvC3g.WrWrDrgPqBiYuyHeqBzRzR; ASP.NET_SessionId=vcesfgjzngntlp3jgt4ko345; skysales=!XBwHs5nd4Gj77LYiyIXA3VYCzZ2FVGJET6zzoeWkmd18buY9hmytbB1cTBqsik2xUEj6j2/oa+WWMA==; rxVisitor=1520869437583UC4T64G1G5GKIH0R6IBVV284IG76OSAV; sticky=two; siteLang=pt; prflTudoAzul=Unknown; _searchid=1520869441321340477; _funilid=fluxo-compra; s_cc=true; _st_ses=12107528576729054; _sptid=1434; _spcid=1455; _st_cart_script=helper_voeazul.js; _st_cart_url=/; _spl_pv=3; dtPC=3$469437577_935h-vCRFJTLIMIDFOJAMJHTPMGOFFMKEIKJSMPI; dtLatC=1; dtCookie=3$79CE18C406E19C7C952E204F5E8ABB6D|RUM+Default+Application|1; dtSa=true%7CC%7C-1%7CAzul%20linhas%20a%C3%A9reas.%20Companhia%20a%C3%A9rea%20do%20Brasil.%7C-%7C1520869507638%7C469437577_935%7Chttps%3A%2F%2Fviajemais.voeazul.com.br%2FAvailability.aspx%7CAzul%20Linhas%20A%C3%A9reas%20Brasileiras%7C1520869449371%7C; rxvt=1520871308527|1520869437585; mbox=session#31f68dac5f6f4ef8b91d14b675fbe532#1520871369|PC#31f68dac5f6f4ef8b91d14b675fbe532.20_90#1584113796; mmapi.store.p.0=%7B%22mmparams.d%22%3A%7B%7D%2C%22mmparams.p%22%3A%7B%22pd%22%3A%221552405509042%7C%5C%22-75834297%7CBAAAAApVAgDkV1%2BU%2BA8AAREAAUL6n%2FinAQB%2F4AU8MIjVSEjw7QkviNVIAAAAAP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FABh2aWFqZW1haXMudm9lYXp1bC5jb20uYnID%2BA8BAAAAAAAAAAAA%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FAQAMmQAAmMriu%2FP4DwD%2F%2F%2F%2F%2FAfgP%2BA%2F%2F%2FwQAAAEAAAAAAUdkAQATIAIAAAAAAAAAAUU%3D%5C%22%22%2C%22srv%22%3A%221552405509052%7C%5C%22nycvwcgus02%5C%22%22%7D%7D; mmapi.store.s.0=%7B%22mmparams.d%22%3A%7B%7D%2C%22mmparams.p%22%3A%7B%7D%7D; _gat=1; utag_main=v_id:01621adb2ea5001d2b890dee62640406900560610086e$_sn:1$_ss:0$_st:1520871308687$ses_id:1520868994727%3Bexp-session$_pn:4%3Bexp-session$dc_visit:1$dc_event:4%3Bexp-session$dc_region:us-east-1%3Bexp-session; _spl_pv=3; s_getNewRepeat=1520869533813-New; s_getDSLVisit=1520869533814; s_sq=azul-novo-prod%3D%2526c.%2526a.%2526activitymap.%2526page%253Dhome%2526link%253DBuscar%252520passagens%2526region%253Dticket-detail%2526pageIDType%253D1%2526.activitymap%2526.a%2526.c%2526pid%253Dhome%2526pidt%253D1%2526oid%253DBuscar%252520passagens%2526oidt%253D3%2526ot%253DSUBMIT',
        Host:'viajemais.voeazul.com.br',
        Origin:'https://www.voeazul.com.br',
        Referer:'https://www.voeazul.com.br/?_ga=2.173199463.515592836.1520827920-2061982920.1519856742',
        'Upgrade-Insecure-Requests':1,
        'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.167 Safari/537.36'
    };
    var formData = {
        _authkey_:'106352422A4DEB0810953636A6FBE2079955529786098DE8B0D32416202E380E34C245FA99C431C7C7A75560FDE65150',
        __EVENTTARGET:'ControlGroupSearch$LinkButtonSubmit',
        ControlGroupSearch$SearchMainSearchView$DropDownListSearchBy:'columnView',
        culture:'pt-BR',
        ControlGroupSearch$SearchMainSearchView$TextBoxPromoCode:'CALLCENT',
        ControlGroupSearch$SearchMainSearchView$RadioButtonMarketStructure:'RoundTrip',
        origin1:'João Pessoa (JPA)',
        ControlGroupSearch$SearchMainSearchView$TextBoxMarketOrigin1:'João Pessoa (JPA)',
        ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacOrigin1:'',
        hdfSearchCodeDeparture1:'1N',
        originIata1:'JPA',
        destination1:'São Paulo - Todos os Aeroportos (SAO)',
        ControlGroupSearch$SearchMainSearchView$TextBoxMarketDestination1:'São Paulo - Todos os Aeroportos (SAO)',
        ControlGroupSearch$SearchMainSearchView$CheckBoxUseMacDestination1:'on',
        hdfSearchCodeArrival1:'1N',
        destinationIata1:'SAO',
        departure1:'27/03/2018',
        ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay1:'27',
        ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth1:'2018-03',
        arrival:'19/04/2018',
        ControlGroupSearch$SearchMainSearchView$DropDownListMarketDay2:'19',
        ControlGroupSearch$SearchMainSearchView$DropDownListMarketMonth2:'2018-04',
        originIata2:'',
        destinationIata2:'',
        ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_ADT:1,
        ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_CHD:0,
        ControlGroupSearch$SearchMainSearchView$DropDownListPassengerType_INFANT:0,
        ControlGroupSearch$SearchMainSearchView$DropDownListFareTypes:'TP'
    };
    
    request.post({url : url, headers : headers, form : formData}).then(function (response) {
        var url = 'https://viajemais.voeazul.com.br/Availability.aspx';
        var headers = {
            Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Encoding':'gzip, deflate, br',
            'Accept-Language':'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
            'Cache-Control':'max-age=0',
            Connection:'keep-alive',
            Cookie:response.request.headers.Cookie,
            Host:'viajemais.voeazul.com.br',
            Referer:'https://www.voeazul.com.br/?_ga=2.173199463.515592836.1520827920-2061982920.1519856742',
            'Upgrade-Insecure-Requests':1,
            'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.167 Safari/537.36'
        };
        request.get({url : url,  headers : headers}).then(function (response) {
            res.json(response);
        });
    });
}