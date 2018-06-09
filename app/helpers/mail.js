/**
 * @author Sávio Muniz
 */
var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'escolandoapp@gmail.com',
        pass: 'escolando123'
    }
});

exports.send = async function (destination, subject, message) {
    var mailOptions = {
        from: 'escolandoapp@gmail.com',
        to: destination,
        subject: subject,
        html: message
    };

    await transporter.sendMail(mailOptions);

    console.log('Email sent to: ' + destination);
};