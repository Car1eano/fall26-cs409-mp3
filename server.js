// Get the packages we need
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose');

// Read .env file
require('dotenv').config();

// Create our Express application
var app = express();

// Use environment defined port or 3000
var port = process.env.PORT || 3000;

// Connect to MongoDB without exposing connection credentials in logs.
mongoose.connect(process.env.MONGODB_URI).then(function () {
    console.log('MongoDB connected successfully');
}).catch(function () {
    console.error('MongoDB connection failed. Check the database credentials and network access settings.');
});

// Allow CORS so that backend and frontend could be put on different servers
var allowCrossDomain = function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    next();
};
app.use(allowCrossDomain);

// Parse URL-encoded and JSON request bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Check the database connection without exposing configuration or credentials.
app.get('/healthz', async function (req, res) {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ message: 'Database unavailable', data: null });
        }
        await mongoose.connection.db.admin().ping();
        res.status(200).json({ message: 'OK', data: { database: 'connected', nodeVersion: process.versions.node } });
    } catch (err) {
        res.status(503).json({ message: 'Database unavailable', data: null });
    }
});

// Use routes as a module (see index.js)
require('./routes')(app, router);

// Start the server
app.listen(port);
console.log('Server running on port ' + port);
