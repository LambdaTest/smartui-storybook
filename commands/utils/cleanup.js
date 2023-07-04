const fs = require('fs');

function cleanup(logger){
    fs.rm('doms', { recursive: true }, (err) => {
        if (err) {
            return logger.error(err);
        }
    });
    return true
}

module.exports = {cleanup}