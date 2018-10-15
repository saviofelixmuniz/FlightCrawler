/**
 * @author Sávio Muniz
 */

module.exports = function (length) {
    var code = "";
    var possible = "ABCDEF0123456789";

    for (var i = 0; i < length; i++)
        code += possible.charAt(Math.floor(Math.random() * possible.length));

    return code;
};
