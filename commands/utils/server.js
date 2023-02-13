var http = require('http');
var finalhandler = require('finalhandler');
var serveStatic = require('serve-static');

async function createStaticServer(staticPath) {
    var serve = serveStatic(staticPath, {'index': false});
    var server = http.createServer(function(req, res){
        var done = finalhandler(req, res);
        serve(req, res, done);
    })
    
    return server.listen();
}

module.exports = { createStaticServer }