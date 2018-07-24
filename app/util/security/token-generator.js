/**
 * @author Sávio Muniz
 */

module.exports = function (length) {
    let code = "";
    let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (let i = 0; i < length; i++)
        code += possible.charAt(Math.floor(Math.random() * possible.length));

    return code;
};
