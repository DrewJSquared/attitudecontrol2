// AttitudeSense.js
// JS module for interfacing with Attitude Sense
// copyright 2023 Drew Shipps, J Squared Systems


// imports
var log = require('npmlog');
var dgram = require('dgram');
const https = require("https");


// variables
var senses = [];
var finalUrls = [];
var serverUpdateNeeded = false;


// config
var SERVER_UPDATE_INTERVAL = 1000; // how often to update the server with current sense statuses, if any need to be updated






// ==================== MODULE EXPORT FUNCTIONS ====================
module.exports = {
	initialize: function () {
		log.info('Attitude Sense', 'Initializing module to communicate with Attitude Sense devices.');
		log.info('Attitude Sense', 'HTTPS server update interval set to ' + SERVER_UPDATE_INTERVAL + 'ms');

		var client = dgram.createSocket('udp4');
		client.bind('6455');

		// on message received
		client.on('message',function(msg,info){
			// turn the message into a JS object
			var messageString = msg.toString();
			var object = JSON.parse(messageString);

			// find this object ID
			var SENSE_ID = object.ID;

			// log that we just got a packet
			log.info('Attitude Sense', 'Just got a status packet from Attitude Sense ID: ' + SENSE_ID);

			// keep a running array of each unique device with the most up to date packet received from it
			var foundIndex = senses.findIndex(obj => obj.ID == object.ID);
			if (foundIndex >= 0) {
				senses[foundIndex] = JSON.parse(JSON.stringify(object));
			} else {
				senses.push(JSON.parse(JSON.stringify(object)));
			}

			// prep the URL to hit the server with the current sense status
			var url = 'https://attitude.lighting/api/senses/';
			var type = '/status/';
			var finalUrl = url + SENSE_ID + type + '[' + object.DATA + ']';

			// add this device's final URL to the array, with the key being the sense ID
			finalUrls[SENSE_ID] = finalUrl;

			// flag that we need to update the server next time the interval runs
			serverUpdateNeeded = true;
		});

		log.info('Attitude Sense', 'System initialized, now listening for communications from Attitude Sense devices.');
	},

	getSenseData: function (id) {
		var foundIndex = senses.findIndex(obj => obj.ID == id);
		if (foundIndex >= 0) {
			return JSON.parse(JSON.stringify(senses[foundIndex]));
		} else {
			return undefined;
		}
	},
};





// ==================== SERVER UPDATE INTERVAL ====================
setInterval(sendAllSenseDataToServer, SERVER_UPDATE_INTERVAL);

function sendAllSenseDataToServer() {
	// log that we are running the interval
	log.info('Attitude Sense', 'HTTPS interval, checking if server update needed.');

	// if a server update of any kind is needed, send all devices updates in queue
	if (serverUpdateNeeded) {
		// loop over final urls (the index is the id of the sense device)
		for (var i = 0; i < finalUrls.length; i++) {
			// if this url exists
			if (finalUrls[i] != null) {
				var finalUrl = finalUrls[i];

				log.info('Attitude Sense', 'HTTPS: Sending Sense ID ' + i + ' status to server...');

				// actual HTTPS get request for this final url
				https.get(finalUrl, resp => {
					let data = "";

					// process each chunk
					resp.on("data", chunk => {
						data += chunk;
					});

					// finished, do something with result
					resp.on("end", () => {
						if (data == 'ok') {
							log.info('Attitude Sense', 'HTTPS: Successfully sent the new status to the attitude.lighting server.');
						}
					});
				}).on("error", err => {
					log.error('Attitude Sense', 'HTTPS: ' + err.message);
				});
			}
		}

		// reset server update needed variable
		serverUpdateNeeded = false;
	}
}

