// AttitudeLED2.js
// JS Module for connecting to Picos for LED display output
// copyright 2023 Drew Shipps, J Squared Systems


// import log
var log = require('npmlog');





// ==================== VARIABLES ====================

var color = 'A';
var LAPTOP_MODE = (process.platform == 'darwin');




// ==================== PORT FUNCTIONS ====================

// Set up serial ports
const { SerialPort } = require('serialport');

var portPath = '/dev/ttyACM0';
if (LAPTOP_MODE) {
	portPath = '/dev/cu.usbmodem1201';
}

const port = new SerialPort({ path: portPath, baudRate: 115200, autoOpen: false, });


// Port error callbacks
port.on('error', function(err) { 
	log.error('LED', err.message);
});


// Port close callbacks
port.on('close', function() {
	log.notice('LED', ' --- ' + new Date().toLocaleTimeString() + ' ---  AttitudeLED Pico disconnected!');

	port.open(function (err) {
		if (err) {
			log.error('AttitudeLED', err.message);

			log.error('AttitudeLED', ' --- ' + new Date().toLocaleTimeString() + ' ---  err on open in init func')
		} else {
			log.info('AttitudeLED', ' Connected to Raspberry Pi Pico. ');
		}
	});
});





// ==================== ATTITUDEDMX FUNCTIONS ====================

// initialize - open serial ports
function initialize() {
	log.info('AttitudeLED', 'Initializing connection to Raspberry Pi Pico...')

	port.open(function (err) {
		if (err) {
			log.error('AttitudeLED', err.message);

			log.error('AttitudeLED', ' --- ' + new Date().toLocaleTimeString() + ' ---  err on open in init func')
		} else {
			log.info('AttitudeLED', ' Connected to Raspberry Pi Pico. ');

			// write color as soon as we r done
			port.write(color, function(err) {
				if (port.isOpen) {
					if (err) return log.error('DMX', 'Error on write: ', err.message);
				}
			});
		}
	});

	setInterval(function () {
		if (port.isOpen) {
			port.write(color, function(err) {
				if (port.isOpen) {
					if (err) return log.error('DMX', 'Error on write: ', err.message);
				}
			});
		} else {
			log.error('AttitudeLED', 'Port is not open. Attempting to reconnect...');

			port.open(function (err) {
				if (err) {
					log.error('AttitudeLED', err.message);

					log.error('AttitudeLED', ' --- ' + new Date().toLocaleTimeString() + ' ---  err on open in init func')
				} else {
					log.info('AttitudeLED', ' Connected to Raspberry Pi Pico. ');
				}
			});
		}
	}, 2000);
}






// ==================== MODULE EXPORT FUNCTIONS ====================

module.exports = {
	initialize: function () {
		initialize();
	},

	setColor: function (theColor) {
		color = theColor;
	},
};
