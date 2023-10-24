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
var Moment = require('moment-timezone');




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

AttitudeEngine.startEngine();

setInterval(() => processSchedule(), 5000); // even without internet we still need to processSchedule to incorporate schedule every 5s
















// build shows patch from schedule
function processSchedule() {
	// get current time in device config timezone
	var timezoneString = config.devicemeta.timezone;
	var currentTime = new Date(Moment().tz(timezoneString).format());
	log.info('Schedule', 'Current time in ' + timezoneString + ' is ' + currentTime);


	// if not assigned or no schedule, exit
	if (typeof config.scheduleBlocks == 'undefined' || notAssignedToLocation) {
		AttitudeEngine.stopEngine();
		outputZerosToAllChannels();

		log.info('Schedule', ' Not assigned to a location, no shows to play. (' + debugTimeString() + ')');

		return;
	}


	// figure out what event block is currently active based on time and schedule
    var currentEventBlockId = 0;

    // check each block on the schedule grid
    for (var s = 0; s < config.scheduleBlocks.length; s++) {
    	var thisBlock = config.scheduleBlocks[s];
    	// if it applies to the current day
    	if (thisBlock.day == currentTime.getDay() + 1) {
    		// if it's within the current time
    		if (thisBlock.start - 1 <= currentTime.getHours() && thisBlock.start - 1 + thisBlock.height > currentTime.getHours()) {
    			currentEventBlockId = thisBlock.eventBlockId;
				// log.notice('DEBUG', '     H ' + currentTime.getHours() + '  evntBlckId ' + currentEventBlockId + '  start ' + (thisBlock.start - 1) + '  end ' + (thisBlock.start - 1 + thisBlock.height));
    		}

    		// use minutes instead of hours, temp for debugging
    		// if (thisBlock.start - 1 <= (currentTime.getMinutes() - 20) && thisBlock.start - 1 + thisBlock.height > (currentTime.getMinutes() - 20)) {
    		// 	currentEventBlockId = thisBlock.eventBlockId;
    		// }
    	}
    }



    // set up the showdata variable which holds what show plays on each zone/group
    var showdata = [
    	0, 0, 0, 0, 0, 0, 0, 0, 0, 0
	];

    // if any event block is active, 
    if (currentEventBlockId > 0) {
    	// find the actual event block from the ID
    	showdata = JSON.parse(JSON.stringify(config.eventBlocks.find(itm => itm.id == currentEventBlockId).showdata));

    	// pull the shows in that block to the currently active showdata variable
    	for (var i = showdata.length; i < 10; i++) {
    		showdata[i] = 0;
    	}
    }

    // log the current showdata variable (which includes the shows from the current scheduled block only)
    // console.log('- showdata pre custom');
    // console.log(showdata);



    // now check each Custom Show Schedule block
    for (var c = 0; c < config.customBlocks.length; c++) {
    	var thisBlock = config.customBlocks[c];

    	// if this block is on today
    	if (thisBlock.month == currentTime.getMonth() + 1 && thisBlock.day == currentTime.getDate()) {
    		var currentTimeNumber = (currentTime.getHours() * 60) + currentTime.getMinutes();
    		var thisBlockStartNumber = (thisBlock.startHour * 60) + thisBlock.startMinute;
    		var thisBlockEndNumber = (thisBlock.endHour * 60) + thisBlock.endMinute;

    		// if the current time is within this block
    		if (currentTimeNumber >= thisBlockStartNumber && currentTimeNumber < thisBlockEndNumber) {
    			// go thru each zone of the showdata for this block and update the main showData variable
    			for (var z = 0; z < thisBlock.showdata.length; z++) {
    				// check if there are groups in this override
					if (thisBlock.showdata[z].length > 0) {
						// grab the show currently scheduled on this zone/groups. we need to apply it to any groups not being overriden
						var oldZoneData = JSON.parse(JSON.stringify(showdata[z]));

						// if the override is set to use groups, then add groups to showdata even if there werent groups previously
						if (thisBlock.showdata[z].length > 1) {
							showdata[z] = [];
						}

						// loop through each group
						for (var g = 0; g < thisBlock.showdata[z].length; g++) {
							if (thisBlock.showdata[z][g] > 0) {
								// this group IS set to override, so apply the new override show to this group
								showdata[z][g] = JSON.parse(JSON.stringify(thisBlock.showdata[z][g]));
							} else {
								// group is set to NO CHANGE, so check what show was previously scheduled per oldZoneData variable
								if (oldZoneData.length > 1) {
									// groups were on unique shows so check what this particular group was set to
									showdata[z][g] = oldZoneData[g];
								} else {
									// in this case, only one show was sccheduled for the whole zone so use that
									showdata[z][g] = oldZoneData;
								}
							}
						}

						// log the new showdata for this zone
						// console.log(showdata[z])
					} else if (thisBlock.showdata[z] > 0) {
						// else override needs to run on the whole zone not just the groups
						showdata[z] = JSON.parse(JSON.stringify(thisBlock.showdata[z]));

						// log that this override is a single and will run on whole zone
						// console.log('custom is single ' + thisBlock.showdata[z])
					}
    			}
    		}
    	}
    }



    // log the current showdata after processing overrides
    log.info('Schedule', 'Processed schedule. Currently playing shows: ' + JSON.stringify(showdata));
    // console.log('- showdata after overrides');
    // console.log(showdata);

    // do a JSON copy of showdata to make sure nothing is referenced but instead pure copied. Not sure if this is strictly necesary.
    var finalShowData = JSON.parse(JSON.stringify(showdata));

    // log finalShowData variable after copy
    // console.log('- finalShowData:');
    // console.log(finalShowData);



    // finally, build a showspatch - a list of shows that need to be run currently and the fixtures to run them on
    showsPatch = [];

	// loop through each zone in the patch
	for (var z = 0; z < config.patch.zonesList.length; z++) {
		if (finalShowData[z].length > 0) {
			// groups in this zone are set to run separate shows
			for (var g = 0; g < config.patch.zonesList[z].groups.length; g++) {
				var fixturesInThisGroup = config.patch.fixturesList.filter(function (itm) {
					return (itm.zoneNumber == z+1 && itm.groupNumber == g+1);
				});
    			if (fixturesInThisGroup.length < 1) { continue; }

    			var thisShowId = finalShowData[z][g];
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

			var thisShowId = finalShowData[z];
			if (thisShowId < 1) { continue; }

			var newShowBlock = {
				counter: 0,
	    		show: findShowById(thisShowId),
	    		fixtures: createEnginePatchFromFixturesList(fixturesInThisZone),
	    	}

	    	showsPatch.push(newShowBlock);
		}
	}


	// log final showspatch
	// console.log(' -------- showsPatch ------- ' + JSON.stringify(showsPatch).length);
	// console.log(showsPatch);


	// log.info showsPatch data
	// for (var i = 0; i < showsPatch.length; i++) {
	// 	log.info('showsPatch', showsPatch[i].fixtures.length + ' fixtures playing show ' + JSON.stringify(showsPatch[i].show));
	// }


	// send showspatch data to engine for shows to be processed and spit out to DMX
	AttitudeEngine.updateShowsPatch(showsPatch);
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
	log.http('SERVER', 'Connected to attitude.lighting server! (' + debugTimeString() + ')');

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

	processSchedule();
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

function debugTimeString() {
	var date = new Date();

	if (typeof config.devicemeta !== 'undefined') {
		if (typeof config.devicemeta.timezone !== 'undefined') {
			var timezoneString = config.devicemeta.timezone;
			date = new Date(Moment().tz(timezoneString).format());
		}
	}

	return ("00" + (date.getMonth() + 1)).slice(-2) + "/" +
				("00" + date.getDate()).slice(-2) + "/" +
				date.getFullYear() + " " +
				("00" + date.getHours()).slice(-2) + ":" +
				("00" + date.getMinutes()).slice(-2) + ":" +
				("00" + date.getSeconds()).slice(-2);
}

function fullDebugTimeString() {
	return ' --- ' + debugTimeString() + ' --- ';
}
