const Properties = require('../db/models/properties');
const TokenGenerator = require('../util/security/token-generator');
const API_KEY_PASSWORD = process.env.API_KEY_PASSWORD;

exports.createAPIKey = async function (req, res, next) {
    try {
        if (!req.body.password) {
            res.status(401).json({err: 'No password provided.'})
        }

        else if (req.body.password !== API_KEY_PASSWORD) {
            res.status(401).json({err: 'Password is incorrect.'});
        }

        let keys = await Properties.findOne({key: "authorized_keys"});

        let token = TokenGenerator(28);

        while (keys.indexOf(token) !== -1) {
            token = TokenGenerator(28);
        }

        keys.value.push(token);
        keys.markModified("value");

        await keys.save();
        console.log("TOKEN CREATED:  " + token);

        res.status(200).json({key: token});
    } catch (err) {
        res.status(500).json({err: err.stack});
    }
};