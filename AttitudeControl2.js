// AttitudeControl2.js
// primary JS app for Attitude Control firmware (2nd gen)
// copyright 2023 Drew Shipps, J Squared Systems



// ==================== VARIABLES ====================
var DEVICE_ID = 0;
var SERIALNUMBER = 'AC-00100XX';
const LAPTOP_MODE = (process.platform == 'darwin');
const SERVER_PING_INTERVAL = 500;
var config = {};
var showsPatch = [];
var notAssignedToLocation = false;

var tryingForAllData = false;




// ==================== IMPORT ====================
const log = require('npmlog');
const fs = require('fs');
const https = require("https");




// ==================== INITIALIZE ====================
log.info('INIT', 'Attitude Control Device Firmware (2nd gen)');
log.info('INIT', 'Copyright 2023 Drew Shipps, J Squared Systems');
log.info('INIT', 'System initializing at time ' + new Date().toLocaleTimeString());

console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  Init Attitude Control Device Firmware (2nd gen) ...');

loadDeviceID();
loadConfigFromJSON();
initializeHTTPSConnection();




// ==================== INIT ATTITUDE DMX ====================
const AttitudeSACN = require('./AttitudeSACN2');
AttitudeSACN.initialize(4);  // default to 4 universes for now

// default to black
outputZerosToAllChannels();




// ==================== INIT ATTITUDE ENGINE ====================
const AttitudeEngine = require('./AttitudeEngine2');

AttitudeEngine.initialize(AttitudeSACN, config);
AttitudeEngine.updateShowsPatch(showsPatch);

setInterval(() => buildShowsPatch(), 5000); // even without internet we still need to buildShowsPatch to incorporate schedule every 5s
















// build shows patch from schedule
function buildShowsPatch() {
	showsPatch = [];

	// get current time
	var currentTime = new Date();

	// console.log(currentTime);
	// console.log('current hour ' + currentTime.getHours());

	if (typeof config.scheduleBlocks == 'undefined' || notAssignedToLocation) {
		AttitudeEngine.stopEngine();
		outputZerosToAllChannels();

		return;
	}

	// figure out what event block is currently active based on time and schedule
    var currentEventBlockId = 0;
    for (var s = 0; s < config.scheduleBlocks.length; s++) {
    	var thisBlock = config.scheduleBlocks[s];
    	if (thisBlock.day == currentTime.getDay() + 1) {
    		if (thisBlock.start - 1 <= currentTime.getHours() && thisBlock.start - 1 + thisBlock.height > currentTime.getHours()) {
    			currentEventBlockId = thisBlock.eventBlockId;
				log.notice('DEBUG', '     H ' + currentTime.getHours() + '  evntBlckId ' + currentEventBlockId + '  start ' + (thisBlock.start - 1) + '  end ' + (thisBlock.start - 1 + thisBlock.height));
    		}
    		// use minutes instead of hours
    		// if (thisBlock.start - 1 <= (currentTime.getMinutes() - 20) && thisBlock.start - 1 + thisBlock.height > (currentTime.getMinutes() - 20)) {
    		// 	currentEventBlockId = thisBlock.eventBlockId;
    		// }
    	}
    }

	// console.log('currentEventBlockId ' + currentEventBlockId);

	// console.log('H ' + currentTime.getHours() + '  evntBlckId ' + currentEventBlockId);

    // if any event block is active, build a showspatch : a list of shows that need to be run currently and the fixtures to run them on
    if (currentEventBlockId > 0) {
    	// find the actual event block from the ID
    	var currentEventBlock = config.eventBlocks.find(itm => itm.id == currentEventBlockId);

    	// loop through each zone in the patch
    	for (var z = 0; z < config.patch.zonesList.length; z++) {
    		if (currentEventBlock.showdata[z].length > 0) {
    			// groups in this zone are set to run separate shows
    			for (var g = 0; g < config.patch.zonesList[z].groups.length; g++) {
    				var fixturesInThisGroup = config.patch.fixturesList.filter(function (itm) {
    					return (itm.zoneNumber == z+1 && itm.groupNumber == g+1);
    				});
	    			if (fixturesInThisGroup.length < 1) { continue; }

	    			var thisShowId = currentEventBlock.showdata[z][g];
	    			if (thisShowId < 1) { continue; }

	    			var newShowBlock = {
    					counter: 0,
			    		show: findShowById(thisShowId),
			    		fixtures: createEnginePatchFromFixturesList(fixturesInThisGroup),
			    	}

			    	showsPatch.push(newShowBlock);
    			}
    		} else {
    			// no groups in this zone or all groups are set to run SINGLE show
    			var fixturesInThisZone = config.patch.fixturesList.filter(itm => itm.zoneNumber == z+1);
    			if (fixturesInThisZone.length < 1) { continue; }

    			var thisShowId = currentEventBlock.showdata[z];
    			if (thisShowId < 1) { continue; }

    			var newShowBlock = {
    				counter: 0,
		    		show: findShowById(thisShowId),
		    		fixtures: createEnginePatchFromFixturesList(fixturesInThisZone),
		    	}

		    	showsPatch.push(newShowBlock);
    		}
    	}

    	AttitudeEngine.updateShowsPatch(showsPatch);
    	AttitudeEngine.ensureEngineIsRunning();
    } else {
    	// else no event blocks are active, so blackout all channels
    	AttitudeEngine.stopEngine();
		outputZerosToAllChannels();
    }
}





// create engine patch from fixtures list
function createEnginePatchFromFixturesList(fixturesList) {
	var resultList = [];
	for (var f = 0; f < fixturesList.length; f++) {
		var thisFixture = fixturesList[f];
		var thisFixtureType = findFixtureType(thisFixture.type);

		if (thisFixtureType.multicountonefixture) {
			var channelsPerSegment = thisFixtureType.channels / thisFixtureType.segments;
			for (var i = 0; i < thisFixture.quantity; i++) {
				var newObject = {
					universe: thisFixture.universe,
					startAddress: thisFixture.startAddress + (channelsPerSegment * i),
					colorMode: thisFixtureType.color,
					color: [0, 0, 0],
				}
				resultList.push(newObject);
			}
		} else if (thisFixtureType.segments > 1) {
			var channelsPerSegment = thisFixtureType.channels / thisFixtureType.segments;
			for (var i = 0; i < thisFixtureType.segments; i++) {
				var newObject = {
					universe: thisFixture.universe,
					startAddress: thisFixture.startAddress + (channelsPerSegment * i),
					colorMode: thisFixtureType.color,
					color: [0, 0, 0],
				}
				resultList.push(newObject);
			}
		} else {
			var newObject = {
				universe: thisFixture.universe,
				startAddress: thisFixture.startAddress,
				colorMode: thisFixtureType.color,
				color: [0, 0, 0],
			}
			resultList.push(newObject);
		}
	}

	return resultList;
}



































// ==================== HTTPS FUNCTIONS ====================

// initializeHTTPSConnection - setup interval for HTTPS connection to attitude.lighting server
function initializeHTTPSConnection() {
	getData(true);
	setInterval(function () {
		getData();
	}, SERVER_PING_INTERVAL);
}

// getData - get all data or only new data from attitude.lighting server and update object
function getData(allData = false) {
	var url = 'https://attitude.lighting/api/devices/';
	var type = '/newdata';
	if (allData || tryingForAllData) {
		type = '/data';
		tryingForAllData = true;
		console.log('+++++  TRYING FOR ALL DATA: ' + tryingForAllData);
	}

	https.get(url + DEVICE_ID + type, resp => {
		let data = "";

		// process each chunk
		resp.on("data", chunk => {
			data += chunk;
		});

		// finished, do something with result
		resp.on("end", () => {

			if (data.length > 5 && tryingForAllData) {
				console.log('+++++  TRYING FOR ALL DATA: ' + tryingForAllData + '  && LENGTH = ' + data.length);

				
				tryingForAllData = false;
				console.log(' ======= ==== RESET TRYING  ======= ==== ');
			}
			parseNewHTTPSData(data);
		});
	}).on("error", err => {
		log.error('HTTPS', 'Error: ' + err.message);
		// AttitudeDMX.setNetworkStatus(false);
	});
}


// parseNewHTTPSData - process new data downloaded from server
function parseNewHTTPSData(data) {
	log.http('SERVER', 'Connected to attitude.lighting server!');

	if (data == 'Unassigned') {
		// log.info('SERVER', '============ UNASSIGNED ============');

		saveConfigToJSON();
		// AttitudeDMX.setNetworkStatus(true);

		AttitudeEngine.stopEngine();
		outputZerosToAllChannels();

		notAssignedToLocation = true;

		return;
	} else {
		notAssignedToLocation = false;
	}

	// attempt to parse JSON data received from server
	newData = tryParseJSONObject(data);

	// if invalid, throw error and return, which should use previously saved data from config file
	if (newData === false) {
		log.error('SERVER', 'Invalid JSON received from server!');

		return;
	}

	Object.keys(newData).forEach(function(key) {
	    if (typeof newData[key] !== 'undefined') {
			config[key] = newData[key];
		}
	});

	saveConfigToJSON();

	// AttitudeDMX.setNetworkStatus(true);

	// reboot device if command received from server
	if (typeof newData.devicemeta !== 'undefined') {
		if (newData.devicemeta.reboot == true || false) {
			console.log('+++++ REBOOT & DELETE CONFIG FILE +++++');
			fs.rmSync('config.json', { recursive: true, force: true });

			if (!LAPTOP_MODE) {
				require('child_process').exec('sudo /sbin/shutdown now', function (msg) { console.log(msg) });
			}
		}
	}

	buildShowsPatch();
}










// ==================== JSON FUNCTIONS ====================

// loadDeviceID - load Device ID from id.json
function loadDeviceID() {
	var path = '../id.json';
	if (LAPTOP_MODE) { path = 'id_template.json'; }

	try {
	  	let rawdata = fs.readFileSync(path);
	
	  	try {
		  	let data = JSON.parse(rawdata);

			DEVICE_ID = data.device_id;
			SERIALNUMBER = data.serialnumber;

			// if either does not update properly then crash the app
			if (!Number.isInteger(DEVICE_ID) || typeof SERIALNUMBER != 'string') {
				log.error('INIT', 'Failed to initialize Device ID and/or Serial Number.');
				process.exit();
			}

		  	log.info('INIT', 'Device ID: ' + DEVICE_ID + ', Serial Number: ' + SERIALNUMBER);
		}
		catch(err) {
		  	log.error('INIT', 'JSON.parse(rawdata) error! Failed to load device ID!');
		  	log.error('INIT', 'Error: ' + err.message);
			process.exit();
		}
	}
	catch(err) {
	  	log.error('INIT', 'id.json file not found! Failed to load device ID!');
	  	log.error('INIT', 'Error: ' + err.message);
		process.exit();
	}
}


// loadConfigFromJSON - load locally saved config from config.json
function loadConfigFromJSON() {
	var rawdata = '{}';
	try {
	  	rawdata = fs.readFileSync('config.json');

	  	try {
		  	config = JSON.parse(rawdata);
			log.info('JSON', 'Loaded locally saved config from config.json!');
		}
		catch(err) {
		  	log.error('JSON', 'JSON.parse(rawdata) error!');
		  	log.error('JSON', 'Error: ' + err.message);
		}
	}
	catch(err) {
	  	log.error('JSON', 'config.json file not found!');
	  	log.error('JSON', 'Error: ' + err.message);
	}
}


// saveConfigToJSON - save config to config.json
function saveConfigToJSON() {
	try {
		var dataToSave = JSON.stringify(config);
		fs.writeFile('config.json', dataToSave, 'utf8', function () {
			// log.info('JSON', 'Successfully saved config to config.json file.');
		});
	}
	catch(err) {
	  	log.error('JSON', 'Failed to save config to config.json file!');
	  	log.error('JSON', 'Error: ' + err.message);
	}
}







// ==================== UTILITY FUNCTIONS ====================

function findShowById(showId) {
	return config.shows.find(itm => itm.id == showId);
}

function findFixtureType(fixtureTypeId) {
	return config.fixtureTypes.find(itm => itm.id == fixtureTypeId);
}

function outputZerosToAllChannels() {
	for (var i = 0; i <= 512; i++) {
		AttitudeSACN.set(1, i, 0);
		AttitudeSACN.set(2, i, 0);
		AttitudeSACN.set(3, i, 0);
		AttitudeSACN.set(4, i, 0);
	}
}

function tryParseJSONObject(jsonString) {
    try {
        var o = JSON.parse(jsonString);

        // Handle non-exception-throwing cases:
        // Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
        // but... JSON.parse(null) returns null, and typeof null === "object", 
        // so we must check for that, too. Thankfully, null is falsey, so this suffices:
        if (o && typeof o === "object") {
            return o;
        }
    }
    catch (e) { }

    return false;
};