var fs = require('fs');

exports.write = function(inputData) {
    fs.writeFile("outfile", JSON.stringify(inputData), function(err) {
        if(err) {
            return console.log(err);
        }

        console.log("The file was saved!");
    });
};