// AttitudeControl2.js
// primary JS app for Attitude Control firmware (2nd gen)
// copyright 2024 Drew Shipps, J Squared Systems



// ==================== VARIABLES ====================
var DEVICE_ID = 0;
var SERIALNUMBER = 'AC-00100XX';

const LAPTOP_MODE = (process.platform == 'darwin');
const SERVER_PING_INTERVAL = 1000;
const SCHEDULE_UPDATE_INTERVAL = 100;

var config = {};
var showsPatch = [];
var notAssignedToLocation = false;

var tryingForAllData = false;

var PROCESS_SCHEDULE_LOGGING = false;

var updateToFirmware2AInProgress = false;




// ==================== IMPORT ====================
const log = require('npmlog');
const fs = require('fs');
const https = require("https");
var Moment = require('moment-timezone');
const { DateTime } = require("luxon");
const { exec } = require('child_process');




// ==================== INITIALIZE ====================
log.info('INIT', 'Attitude Control Device Firmware (2nd gen)');
log.info('INIT', 'Copyright 2024 Drew Shipps, J Squared Systems');
log.info('INIT', 'System initializing at time ' + new Date().toLocaleTimeString());

console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  Init Attitude Control Device Firmware (2nd gen) ...');

loadDeviceID();
loadConfigFromJSON();
initializeHTTPSConnection();




// ==================== INIT ATTITUDE DMX ====================
const AttitudeSACN = require('./AttitudeSACN2');
AttitudeSACN.initialize(8);

// default to black
outputZerosToAllChannels();




// ==================== INIT ATTITUDE ENGINE ====================
const AttitudeEngine = require('./AttitudeEngine2');

AttitudeEngine.initialize(AttitudeSACN, config);
AttitudeEngine.updateShowsPatch(showsPatch);

AttitudeEngine.startEngine();

setInterval(() => processSchedule(), SCHEDULE_UPDATE_INTERVAL); // always process schedule every interval regardless of network




// ==================== INIT ATTITUDE LED ====================
const AttitudeLED = require('./AttitudeLED2');
AttitudeLED.initialize();
AttitudeLED.setColor('B'); // a = full color, b = purple for no network




// ==================== INIT ATTITUDE SENSE ====================
const AttitudeSense = require('./AttitudeSense');
AttitudeSense.initialize();




// ==================== RUN COMMAND TO CLEAR OUT OLD LOG FILES - TEMP AS OF 5-21-2024 TO ATTEMPT TO FIX DEVICES CRASHING ====================
log.error('LOG FILE CLEANOUT', 'Trying to clear out log files to regain space on the SD card!');
console.log('Executing command `rm -rf ~/.pm2/logs/*`...');

try {
	require('child_process').exec('rm -rf ~/.pm2/logs/*', function (error, stdout, stderr) {
		// catch error
	    if (error !== null) {
	        log.error('LOG FILE CLEANOUT', '`rm -rf ~/.pm2/logs/*` exec error ' + error);
	        console.log('exec error: ' + error);
	    }

	    // if there was a response
	    if (stdout.length > 0) {
			log.error('LOG FILE CLEANOUT', 'Response exists, let\'s see what it is!');
			log.error('LOG FILE CLEANOUT', stdout);
	    } else {
			log.info('LOG FILE CLEANOUT', 'No response from system indicates success!!');
		}
	});	
} catch (e) {
	log.error('LOG FILE CLEANOUT', 'FAILED while running log file cleanout command!! Error:');
	console.log(e);
}
















// build shows patch from schedule
function processSchedule() {
	// ensure devicemeta is not undefined
	if (typeof config.devicemeta == 'undefined') {
		log.error('processSchedule', 'config.devicemeta is undefined! Unable to process timezone & device schedule. skipping...');
		return;
	}

	// get current time in device config timezone
	var timezoneString = config.devicemeta.timezone;
	var local = DateTime.local();
	var rezoned = local.setZone(timezoneString);
	if (PROCESS_SCHEDULE_LOGGING) { log.info('Schedule', 'Current time (rezoned) in ' + timezoneString + ' is ' + rezoned.toFormat("ccc LLL d yyyy H:mm:ss 'GMT'ZZ (ZZZZZ)")); }


	// if not assigned or no schedule, exit
	if (typeof config.scheduleBlocks == 'undefined' || notAssignedToLocation) {
		AttitudeEngine.stopEngine();
		outputZerosToAllChannels();

		log.info('Schedule', ' Not assigned to a location, no shows to play. (' + debugTimeString() + ')');

		return;
	}


	// UPDATE TO 2.A HERE!
	// console.log(config.updateToFirmware2A ?? false);
	if (config.updateToFirmware2A ?? false) {
		// make sure we aren't already updating
		if (!updateToFirmware2AInProgress) {
			updateToFirmware2AInProgress = true;

	        // Command to run the update
	        const command = './install2a.sh';

	        // Execute the command
	        exec(command, (error, stdout, stderr) => {
	            if (error) {
	            	console.log(error);
	            } else {
	            	console.log('Success!');

	                // get the results string from running the update
	                const lines = stdout.split('\n');
	                const results = lines[lines.length - 2].trim();

	            	console.log(results);
	            }
	        });	
	    }
    }


    // if an update is already in progress, don't continue processing the schedule.
    // this resolves the flickering issues during the 2.A update process
    if (updateToFirmware2AInProgress ?? false) {
    	return;
    }




	// figure out what event block is currently active based on time and schedule
    var currentEventBlockId = 0;

    // check each block on the schedule grid
    for (var s = 0; s < config.scheduleBlocks.length; s++) {
    	var thisBlock = config.scheduleBlocks[s];
    	// if it applies to the current day
    	if (thisBlock.day == offsetWeekdayForLuxon(rezoned.weekday)) {
    		// if it's within the current time
    		if (thisBlock.start - 1 <= rezoned.hour && thisBlock.start - 1 + thisBlock.height > rezoned.hour) {
    			currentEventBlockId = thisBlock.eventBlockId;
    		}
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



    // log the current showdata after processing the weekly show schedule
    if (PROCESS_SCHEDULE_LOGGING) { log.info('Schedule', 'Showdata after processing standard weekly schedule:  ' + JSON.stringify(showdata)); }



    // now process each Custom Show Schedule block
    for (var c = 0; c < config.customBlocks.length; c++) {
    	var thisBlock = config.customBlocks[c];

    	// check if this block should be today based on it either being an old single day block or a new multi day block
    	var thisBlockShouldBeToday = false;
    	if (varExists(thisBlock.month) && varExists(thisBlock.day)) {
    		if (thisBlock.month == rezoned.month && thisBlock.day == rezoned.day) {
    			thisBlockShouldBeToday = true;
				log.notice('Schedule', 'This is an old type of custom schedule block. Please rebuild this block.');
    		}
    	} else if (varExists(thisBlock.startMonth) && varExists(thisBlock.startDay) && varExists(thisBlock.endMonth) && varExists(thisBlock.endDay)) {
    		startMonthDayStamp = thisBlock.startMonth * 100 + thisBlock.startDay;
    		endMonthDayStamp = thisBlock.endMonth * 100 + thisBlock.endDay;
    		currentMonthDayStamp = rezoned.month * 100 + rezoned.day;

    		// console.log('currentMonthDayStamp ' + currentMonthDayStamp + ' startMonthDayStamp ' + startMonthDayStamp + ' endMonthDayStamp ' + endMonthDayStamp);

    		if (endMonthDayStamp >= startMonthDayStamp && currentMonthDayStamp >= startMonthDayStamp && currentMonthDayStamp <= endMonthDayStamp) {
    			thisBlockShouldBeToday = true;
    		} else if (endMonthDayStamp < startMonthDayStamp && (currentMonthDayStamp >= startMonthDayStamp || currentMonthDayStamp <= endMonthDayStamp)) {
    			thisBlockShouldBeToday = true;
    			log.info('Schedule', 'This schedule block wraps around the new year.')
    		}
    	}

    	// if this block should be today based on previous calculations
    	if (thisBlockShouldBeToday) {
    			// console.log('---- THIS CUSTOM BLOCK IS TODAY')

    		var currentTimeNumber = (rezoned.hour * 60) + rezoned.minute;
    		var thisBlockStartNumber = (thisBlock.startHour * 60) + thisBlock.startMinute;
    		var thisBlockEndNumber = (thisBlock.endHour * 60) + thisBlock.endMinute;

    		// if the current time is within this block
    		if (currentTimeNumber >= thisBlockStartNumber && currentTimeNumber < thisBlockEndNumber) {
    			// console.log('---- THIS CUSTOM BLOCK IS ACTIVE')

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



    // log the current showdata after processing custom show schedule
    if (PROCESS_SCHEDULE_LOGGING) { log.info('Schedule', 'Showdata after processing custom show schedule:      ' + JSON.stringify(showdata)); }



    // Process Attitude Sense overrides

    // loop through each sense
    for (var s = 0; s < config.senses.length; s++) {
    	var thisSense = config.senses[s];
    	var thisSenseCurrentData = AttitudeSense.getSenseData(thisSense.id);

    	if (thisSenseCurrentData == undefined) { 
    		log.error('Attitude Sense', 'Attitude Sense ' + thisSense.serialnumber + ' is assigned to this location but not connected! No data received :(')
    		continue; 
    	}

    	var thisSensePortsArray = JSON.parse('[' + thisSenseCurrentData.DATA + ']');

    	for (var p = 0; p < 16; p++) {
    		// console.log(thisSense.data[p]);



    		// find the override object associated with this port
    		var thisOverride = undefined;
    		var foundIndex = config.overrides.findIndex(obj => obj.id == thisSense.data[p].override_id);
			if (foundIndex >= 0) {
				thisOverride = JSON.parse(JSON.stringify(config.overrides[foundIndex]));
			} else {
				continue;
			}


			// check the port mode, different behavior for toggle vs pulse
    		if (thisSense.data[p].mode == 'toggle') {
    			if (thisSensePortsArray[p] == 1) {
    				// console.log('RUN OVERRIDE');

    				// update showdata by layering in data from override showsdata
    				showdata = layerAnOverride(showdata, JSON.parse(thisOverride.showsdata));
    			} else {
    				// console.log('NO OVERRIDE');
    			}
    		} else if (thisSense.data[p].mode == 'pulse') {
    			// console.log('PULSE');
    		}

    	}

    	// console.log(thisSensePortsArray);
    	// console.log(thisSense.data);
    }

    // log showdata after processing attitude sense overrides
    if (PROCESS_SCHEDULE_LOGGING) { log.info('Schedule', 'Showdata after processing Attitude Sense overrides:  ' + JSON.stringify(showdata)); }









    // loop through each web override (in reverse order so override #1 is processed last)
    for (var w = config.webOverrides.length-1; w >= 0; w--) {
    	// console.log(config.webOverrides[w]);

    	if (config.webOverrides[w].active) {
    		// find the override object associated with this port
    		var thisOverride = undefined;
    		var foundIndex = config.overrides.findIndex(obj => obj.id == config.webOverrides[w].override_id);
			if (foundIndex >= 0) {
				thisOverride = JSON.parse(JSON.stringify(config.overrides[foundIndex]));
			} else {
				continue;
			}

    		showdata = layerAnOverride(showdata, JSON.parse(thisOverride.showsdata));
    	}
	}

	// log the schedule after processing web overrides
    if (PROCESS_SCHEDULE_LOGGING) { log.info('Schedule', 'Showdata after processing web activated overrides:   ' + JSON.stringify(showdata)); }



    // do a JSON copy of showdata to make sure nothing is referenced but instead pure copied. Not sure if this is strictly necesary.
    var finalShowData = JSON.parse(JSON.stringify(showdata));




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
    if (PROCESS_SCHEDULE_LOGGING) { log.info('ShowsPatch', 'Final showspatch length: ' + JSON.stringify(showsPatch).length); }


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



function layerAnOverride(base, layer) {
	var final = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

	// go thru each zone of the base and update final
	for (var z = 0; z < base.length; z++) {
		// check if there are groups in this zone of the layer
		if (layer[z].length > 0) {
			// grab the show currently scheduled on this zone/groups. we need to apply it to any groups not being overriden
			var oldZoneData = JSON.parse(JSON.stringify(base[z]));

			// since the override is set to use groups, then add groups to the final since there werent groups previously
			final[z] = [];

			// loop through each group
			for (var g = 0; g < layer[z].length; g++) {
				if (layer[z][g] > 0) {
					// this group IS set to override (since new layer[z][g] > 0), so apply the new override show to this group
					final[z][g] = JSON.parse(JSON.stringify(layer[z][g]));
				} else {
					// group is set to NO CHANGE, so check what show was previously scheduled per oldZoneData variable
					if (oldZoneData.length > 1) {
						// groups were on unique shows so check what this particular group was set to
						final[z][g] = JSON.parse(JSON.stringify(oldZoneData[g]));
					} else {
						// in this case, only one show was sccheduled for the whole zone so use that
						final[z][g] = JSON.parse(JSON.stringify(oldZoneData));
					}
				}
			}
		// else new layer needs to run on the whole zone not just the groups
		} else if (layer[z] > 0) {
			// console.log('z ' + z + ' set to layer' + layer[z]);
			final[z] = JSON.parse(JSON.stringify(layer[z]));
		} else {
			// console.log('z ' + z + ' set to base!' + base[z]);
			final[z] = JSON.parse(JSON.stringify(base[z]));
		}


	}

	// console.log('layer an override final ' + JSON.stringify(final));

	return final;
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
		log.http('Server', 'Attempting to load a fresh set of data from the attitude.lighting server.')
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
				tryingForAllData = false;

				log.http('Server', 'Successfully pulled a complete fresh set of data from the attitude.lighting server.')
			}
			parseNewHTTPSData(data);
		});
	}).on("error", err => {
		log.error('HTTPS', 'Error: ' + err.message);
		AttitudeLED.setColor('B');
	});
}


// parseNewHTTPSData - process new data downloaded from server
function parseNewHTTPSData(data) {
	log.http('Server', 'Connected to attitude.lighting server! (' + debugTimeString() + ')');

	if (data == 'Unassigned') {
		// log.info('SERVER', '============ UNASSIGNED ============');

		saveConfigToJSON();
		AttitudeLED.setColor('A');

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

	AttitudeLED.setColor('A');

	// reboot device if command received from server
	
	//  !! FUNCTIONALITY REMOVED, MIGRATED TO REBOOT.JS FILE !!

	// if (typeof newData.devicemeta !== 'undefined') {
	// 	if (newData.devicemeta.update == true || false) {
	// 		console.log('+++++ RUN MANUAL UPDATE NOW +++++');
	// 		require('child_process').exec('cd ~/Documents/attitude && node manualupdate2.js && pm2 restart 0', function (msg) { console.log(msg) });
	// 	} else if (newData.devicemeta.reboot == true || false) {
	// 		console.log('+++++ REBOOT & DELETE CONFIG FILE +++++');
	// 		fs.rmSync('config.json', { recursive: true, force: true });

	// 		if (!LAPTOP_MODE) {
	// 			require('child_process').exec('sudo /sbin/shutdown now', function (msg) { console.log(msg) });
	// 		}
	// 	}
	// }

	// processSchedule(); // removed this here because process schedule is called in 1 second interval earlier
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


function offsetWeekdayForLuxon(luxonWeekday) {
	return (luxonWeekday % 7 + 1);
}

function varExists(foo) {
	return (typeof foo !== 'undefined');
}
