exports.noFlightChecker = function (data, res) {
    var legs = Object.keys(data['Trechos']);
    if (data['Trechos'][legs[0]]['Voos'].length === 0 || data['Trechos'][legs[1]]['Voos'].length === 0) {
        res.status(400);
        res.json({
            err : 'No flight available'
        });
    }
};