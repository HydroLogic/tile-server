
// built-ins
var fs = require('fs')
  , http = require('http')
  , path = require('path');

// third-party
var express = require('express')
  , tilelive = require('tilelive')
  , MBTiles = require('mbtiles');

// export
module.exports = TileServer;

var cmd = require('commander')
    .version(require('./package.json').version)
    .option('-p, --port <port>', 'specify the port [3000]', Number, 3001)
    .parse(process.argv);

// setup mbtiles
tilelive.protocols['mbtiles:'] = MBTiles;

/***
TileServer wraps functionality for serving tiles in one package.
***/
function TileServer(tiledir, callback) {
    // setup
    var server = this;

    server.setupApp();
    server.tiledir = path.resolve(tiledir);
    server._cache = {} // for open mbtiles

    MBTiles.list(server.tiledir, function(err, result) {
        if (err) { return callback(err); }
        server.tiles = result;
        callback(null, server);
    });

    return this;
}

TileServer.prototype.setupApp = function() {
    var app = this.app = express()
      , server = this;

    app.use(express.logger('dev'));
    app.use(app.router);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'hjs');
    app.use(express.static(__dirname + '/public'));

    app.param('mbtiles', function(req, res, next, id) {
        server.getMBTiles(id, function(err, mbtiles) {
            if (err) { return next(err); }
            req.mbtiles = mbtiles;
            next();
        });
    });

    app.get('/:mbtiles', function(req, res) {

        req.mbtiles.getInfo(function(err, info) {
            if (err && err.message.match(/Not found/i)) {
                return res.send(404, err.message);
            }

            if (err) {
                console.error(err);
                return res.send(500, err);
            }

            // serving locally
            info.scheme = 'xyz';
            info.tiles = ['/' + info.id + '/{z}/{x}/{y}.png'];

            if (info.template) {
                info.grids = ['/' + info.id + '/{z}/{x}/{y}.json'];
            }

            if (req.xhr) {
                res.json(info);
            } else {
                res.render('map', {
                    map: info,
                    tilejson: JSON.stringify(info)
                });
            }
        });
    });

    app.get('/:mbtiles/:z/:x/:y.:ext', function(req, res) {
        var x = +req.params.x
          , y = +req.params.y
          , z = +req.params.z
          , format = req.params.ext;

        // one get for everything
        var get = format === 'json' ? 'getGrid' : 'getTile';

        req.mbtiles[get](z, x, y, function(err, tile_data, options) {

            if (err && err.message.match(/Not found/i)) {
                return res.send(404, err.message);
            }

            if (err) {
                console.error(err);
                return res.send(500, err);
            }

            // set headers
            res.set(options);
            res.send(tile_data);
        });
    });

}

TileServer.prototype.getMBTiles = function(id, callback) {
    // get an mbtiles instance, checking the cache first
    var server = this;

    // bail early if we don't know about this tileset
    if (!server.tiles[id]) { 
        return callback(new Error('MBTiles <'+id+'> not found')); 
    }

    // check cache so we only open once
    if (server._cache[id]) {
        return callback(null, server._cache[id]);
    } else {
        server._cache[id] = new MBTiles(server.tiles[id], function(err, mbtiles) {
            if (err) { return callback(err); }

            // store and return the new mbtiles
            server._cache[id] = mbtiles;
            callback(err, mbtiles);
        });
    }
}

TileServer.prototype.listen = function(port, callback) {
    this.app.listen(port, callback);
    return this;
}

if (module === require.main) {
    var server = new TileServer(cmd.args.shift() || '.', function(err, server) {
        console.log('Tiles found: \n');
        console.dir(server.tiles);

        server.listen(cmd.port, function() { 
            if (err) { throw err; }
            console.log('Serving tiles at localhost:%s', cmd.port);
        });
    });
}