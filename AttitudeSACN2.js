// AttitudeSACN2.js
// JS sACN module for Attitude DMX
// copyright 2023 Drew Shipps, J Squared Systems


// import log
var log = require('npmlog');





// ==================== IMPORT ====================
var e131 = require('e131');




// ==================== VARIABLES ====================
var clients = [];
var packets = [];
var slotsDatas = [];

var UNIVERSES = 4;  // 4 is default, but this can be changed in setup var
var DMX_INTERVAL_SPEED = 24;  // 24ms = 40x per second (using 24 per testing)

var DEBUG_FPS = true;
var fps = 0;

var STOP_OUTPUTTING_WHILE_UPDATING = false;







// ==================== DEBUG INTERVAL ====================
if (DEBUG_FPS) {
	setInterval(function () {
		log.info('DMX Status', 'FPS: ' + fps);
		fps = 0;
	}, 1000);
}







// ==================== MODULE EXPORT FUNCTIONS ====================
module.exports = {
	initialize: function (univ) {
		UNIVERSES = univ;

		log.info('Attitude sACN', 'Initializing with ' + UNIVERSES + ' universes at a ' + DMX_INTERVAL_SPEED + 'ms interval...');

		// set up all universes
		for (var i = 0; i < UNIVERSES + 1; i++) {
			clients[i] = new e131.Client(i+1);
			packets[i] = clients[i].createPacket(512);
			slotsDatas[i] = packets[i].getSlotsData();

			packets[i].setSourceName('Attitude sACN Client');
			packets[i].setUniverse(i + 1);
			packets[i].setOption(packets[i].Options.PREVIEW, false);
			packets[i].setPriority(packets[i].DEFAULT_PRIORITY);
		}

		// set all packets in last universe + 1 to white
		for (var c = 0; c < 512; c++) {
			slotsDatas[UNIVERSES][c] = 255;
		}

		// set up DMX interval for sending packets out via client.send()
		dmxIntervalActive = true;
		dmxinterval = setInterval(() => {
			fps++;

			if (STOP_OUTPUTTING_WHILE_UPDATING) {
				return;
			}

			// send regular universes
			for (var u = 0; u < UNIVERSES; u++) {
				// send over sACN
				clients[u].send(packets[u], function () {
					// sent callback
				});
			}

			// send universe 9 (aka universe count + 1) of sACN as permenantly white
			clients[UNIVERSES].send(packets[u]);
		}, DMX_INTERVAL_SPEED);

		log.info('Attitude sACN', 'System initialized, now outputting DMX over sACN.');
	},

	set: function (u, c, v) {
		if (u > 0 && u <= UNIVERSES) {
			if (c > 0 && c <= 512) {
				if (v >= 0 && v <= 255) {
					slotsDatas[u-1][c-1] = v;
				}
			}
		}
	},

	stopUpdatingWhileOutputting() {
		STOP_OUTPUTTING_WHILE_UPDATING = true;
	}
};