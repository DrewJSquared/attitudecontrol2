// AttitudeSense.js
// JS module for interfacing with Attitude Sense
// copyright 2023 Drew Shipps, J Squared Systems


// imports
var log = require('npmlog');
var dgram = require('dgram');
const https = require("https");

var senses = [];






// ==================== MODULE EXPORT FUNCTIONS ====================
module.exports = {
	initialize: function () {
		log.info('Attitude Sense', 'Initializing system to connect to Attitude Sense devices.');

		var client = dgram.createSocket('udp4');
		client.bind('6455');

		client.on('message',function(msg,info){
			var messageString = msg.toString();
			var object = JSON.parse(messageString);
			// console.log(object);

			// keep a running array of each unique unit with the most up to date packet received from it
			var foundIndex = senses.findIndex(obj => obj.ID == object.ID);
			if (foundIndex >= 0) {
				senses[foundIndex] = JSON.parse(JSON.stringify(object));
			} else {
				senses.push(JSON.parse(JSON.stringify(object)));
			}

			var SENSE_ID = object.ID;

			// HTTPS hit the server to let it know about the update in port status
			var url = 'https://attitude.lighting/api/senses/';
			var type = '/status/';

			log.info('Attitude Sense', 'Just got a status packet from Attitude Sense ID: ' + SENSE_ID);
			log.info('Attitude Sense', 'HTTPS: Sending new status to server...');

			var finalUrl = url + SENSE_ID + type + '[' + object.DATA + ']';

			// console.log(finalUrl);

			// actually send to server via HTTPS get
			https.get(finalUrl, resp => {
				let data = "";

				// process each chunk
				resp.on("data", chunk => {
					data += chunk;
				});

				// finished, do something with result
				resp.on("end", () => {

					if (data == 'ok') {
						log.info('Attitude Sense', 'HTTPS: Successfully sent the new status to the attitude.lighting server.')
					}
				});
			}).on("error", err => {
				log.error('Attitude Sense', 'HTTPS: ' + err.message);
			});
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

