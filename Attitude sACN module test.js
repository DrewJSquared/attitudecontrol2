// attitude sACN module tester
// copyright 2023 Drew Shipps, J Squared Systems







// ==================== INIT ATTITUDE DMX ====================
const AttitudeSACN = require('./AttitudeSACN2');

const univ = 6;
AttitudeSACN.initialize(univ);





var value = 0;
var color = 0;

setInterval(function () {
	// loop through universes
	for (var u = 0; u < univ; u++) {
		// update slots
		var thisUniverseColor = (u + color) % 4;
		for (var i = 0; i < 128; i++) {
			AttitudeSACN.set(u+1,i*4 + 1,0);
			AttitudeSACN.set(u+1,i*4 + 2,0);
			AttitudeSACN.set(u+1,i*4 + 3,0);
			AttitudeSACN.set(u+1,i*4 + 4,0);

			AttitudeSACN.set(u+1,i*4 + thisUniverseColor + 1, value);
		}
	}


	value += 2;
	if (value > 255) {
		value = 0;
		color++;
		if (color > univ-1) {
			color = 0;
		}
	}
}, 25);
