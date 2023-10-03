const fs = require('fs');

function cleanup(){
    fs.rm('doms', { recursive: true }, (err) => {
        if (err) {
            return console.error(err);
        }
    });
    return true
}

module.exports = {cleanup}