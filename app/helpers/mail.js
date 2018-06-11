/**
 * @author Sávio Muniz
 */
const Properties = require('../db/models/properties');
const SENDER = 'Flight Server <noreply@mms-voelegal.awsapps.com>';

var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});

exports.send = async function (destination, subject, message) {
    var mailTargets = (await Properties.findOne({'key': "mail_targets"}, '', {lean: true})).value;

    var params = {
        Destination: {
            ToAddresses: [
                'saviofelixcoutinho@gmail.com'
            ]
        },
        Message: {
            Body: {
                Html: {
                    Charset: "UTF-8",
                    Data: message
                },
            },
            Subject: {
                Charset: 'UTF-8',
                Data: subject
            }
        },
        Source: SENDER
    };

    params['Destination']['ToAddresses'] = destination === 'target' ? mailTargets : destination;

    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
    var data = await sendPromise;

    console.log('Email sent: ' + data.MessageId);
};