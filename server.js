var http = require('http');
var path = require('path');
var express = require('express');
var request = require('request');
var mongodb = require('mongodb');
var querystring = require('querystring');

// Configuration parameters
require('dotenv').config();
var mongodbUrl = process.env.MONGODB_URL;
var bingSearchKey = process.env.BING_SEARCH_KEY;

var mongodbConnection = null;
mongodb.connect(mongodbUrl, function(err, db) {
  if (err) throw err;
  mongodbConnection = db;
});

var app = express();


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/**
 * Renders the homepage
 */
app.get('/', function(req, res) {
  res.render('index', {
    schemeAndHost: getSchemeAndHost(req),
  });
});

/**
 * Searches for images using Bing API
 */
app.get(/\/api\/imagesearch\/(.*)/, function(req, res, next) {
  var query = req.params[0];
  searchImages({
    query: query,
    offset: parseInt(req.query.offset) || 0,
  }, function(err, results) {
    if (err) return next(err);
    saveProcessedQuery(query, function(err) {
      if (err) return next(err);
      res.json(results);
    });
  });
});

/**
 * Returns the latest submitted queries
 */
app.get('/api/latest/imagesearch/', function(req, res, next) {
  getProcessedQueries(function(err, docs) {
    res.json(docs);
  });
});

/**
 * Listen on the provided port, on all network interfaces.
 */
var server = http.createServer(app);
server.listen(process.env.PORT || 3000, function() {
  var bind = server.address();
  console.log("Listening on " + bind.address + ':' + bind.port);
});

/**
 * Returns the base website url based on client request
 */
function getSchemeAndHost(request) {
  return request.protocol + '://' + request.get('host');
};

/**
 * Invokes callback with list of images retrieved from Bing
 */
function searchImages(options, callback) {
  var query = {
    q: options.query,
    count: options.count || 10,
    offset: options.offset || 0,
  };
  request({
    url: 'https://api.cognitive.microsoft.com/bing/v5.0/images/search?'
       + querystring.stringify(query),
    headers: {
      'Ocp-Apim-Subscription-Key': bingSearchKey,
    },
  }, function(err, response, body) {
    if (err) return callback(err);
    callback(null, JSON.parse(body).value.map(function(image) {
      return {
        url: image.contentUrl,
        snippet: image.name,
        thumbnail: image.thumbnailUrl,
        context: image.hostPageUrl,
      };
    }));
  });
}

/**
 * Saves the processed query to MongoDB
 */
function saveProcessedQuery(query, cb) {
  var db = mongodbConnection;
  if (db === null) {
    return cb("Connection to mongodb has not yet been established.");
  }
  db.collection('processed_queries').insertOne({
    query: query,
    timestamp: Date.now(),
  }, function(err, result) {
    if (err) throw err;
    cb(null);
  });
}

/**
 * Retrieves last 10 processed queries
 */
function getProcessedQueries(cb) {
  var db = mongodbConnection;
  if (db === null) {
    return cb("Connection to mongodb has not yet been established.");
  }
  db.collection('processed_queries').find().sort({
    timestamp: -1
  }).limit(10).toArray(function(err, docs) {
    if (err) return cb(err);
    return cb(null, docs.map(function(result) {
      return {
        term: result.query,
        when: new Date(result.timestamp).toISOString(),
      };
    }));
  });
}
