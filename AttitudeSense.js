// AttitudeSense.js
// JS module for interfacing with Attitude Sense
// copyright 2023 Drew Shipps, J Squared Systems


// import log
var log = require('npmlog');


// import dgram
var dgram = require('dgram');





// var dgram = require('dgram');



// setInterval(function () {
// 	var message = 'Hello World!';
// 	client.send(message,0, message.length, 1883, '10.0.0.37');
// }, 1000);

// client.on('message',function(msg,info){
// 	// console.log(info.address + '@' + info.port + ': ' + msg.toString());

// 	var messageString = msg.toString();
// 	var object = JSON.parse(messageString);
// 	console.log(object);


//   // console.log('Data received from server : ' + msg.toString());
//   // console.log('Received %d bytes from %s:%d\n',msg.length, info.address, info.port);
// });

// client.send('Hello2World!',0, 12, 12000, '127.0.0.1');
// client.send('Hello3World!',0, 12, 12000, '127.0.0.1', function(err, bytes) {
// client.close();
// });










// ==================== MODULE EXPORT FUNCTIONS ====================
module.exports = {
	initialize: function () {
		log.info('Attitude Sense', 'Initializing with ' + UNIVERSES + ' universes at a ' + DMX_INTERVAL_SPEED + 'ms interval...');

		var client = dgram.createSocket('udp4');
		client.bind('6455');

		client.on('message',function(msg,info){
			// console.log(info.address + '@' + info.port + ': ' + msg.toString());

			var messageString = msg.toString();
			var object = JSON.parse(messageString);
			console.log(object);


		  // console.log('Data received from server : ' + msg.toString());
		  // console.log('Received %d bytes from %s:%d\n',msg.length, info.address, info.port);
		});

		log.info('Attitude Sense', 'System initialized, now listening for communications from Attitude Sense devices.');
	},
};

