
/***
Core dependencies
***/

// built-ins
var fs = require('fs')
  , http = require('http')
  , path = require('path');

// third-party
var express = require('express')
  , tilelive = require('tilelive')
  , MBTiles = require('mbtiles');

var cmd = require('commander')
    .version(require('./package.json').version)
    .option('-p, --port <port>', 'specify the port [3000]', Number, 3001)
    .parse(process.argv);

// setup mbtiles
tilelive.protocols['mbtiles:'] = MBTiles;

var tilepath = 'mbtiles://' + path.resolve(cmd.args.shift());

var mbtiles;
new MBTiles(tilepath, function(err, db) {
	mbtiles = db;
});

// the app itself
var app = express();

app.use(express.logger('dev'));
app.use(app.router);
app.use(express.static(__dirname + '/public'));

app.get('/:z/:x/:y.png', function(req, res) {
	var x = +req.params.x
	  , y = +req.params.y
	  , z = +req.params.z;

	mbtiles.getTile(z, x, y, function(err, tile_data, options) {
		if (err) {
			console.error(err);
			return res.send(500, err);
		}

		// set headers
		res.set(options);
		res.send(tile_data);
	});
});

http.createServer(app).listen(cmd.port, function(err) {
	if (err) { throw err; }
	console.log('Serving tiles at localhost:%s', cmd.port);
});