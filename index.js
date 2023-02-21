'use strict';

var os = require('os');
var nodeStatic = require('node-static');
var https = require('https');
var socketIO = require('socket.io');

var fileServer = new(nodeStatic.Server)();

const fs = require('node:fs');

const options = {
  key: fs.readFileSync('keys/key.pem'),
  cert: fs.readFileSync('keys/cert.pem'),
};
console.log("Running on https://localhost:8080");
var app = https.createServer(options, function(req, res) {
  fileServer.serve(req, res);
}).listen(8080);

var io = socketIO.listen(app);
io.sockets.on('connection', function(socket) {
  socket.on('message', function(room_name, message) {
    console.info('Client said: ', message, ' in room ', socket.rooms[room_name]);
    if (socket.rooms[room_name]) {
      socket.to(room_name).emit('message', message);
    }
  });

  socket.on('create or join', function(room) {
    console.log('Received request to create or join room ' + room);

    var clientsInRoom = io.sockets.adapter.rooms[room];
    var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
    console.log('Room ' + room + ' now has ' + numClients + ' client(s)');

    if (numClients === 0) {
      socket.join(room);
      console.log('Client ID ' + socket.id + ' created room ' + room);
      socket.emit('created', room, socket.id);
    } else if (numClients === 1) {
      console.log('Client ID ' + socket.id + ' joined room ' + room);
      io.sockets.in(room).emit('join', room);
      socket.join(room);
      socket.emit('joined', room, socket.id);
      io.sockets.in(room).emit('ready');
    } else { // max two clients
      socket.emit('full', room);
    }
    console.log(io.sockets.adapter.rooms);
  });

  socket.on('close room', function(room_name) {
    console.log("before closing room: ", room_name, " : ", io.sockets.adapter.rooms);
    io.sockets.in(room_name).emit('closing room');
    let room = io.sockets.adapter.rooms[room_name];
    if (room) {
        for (let client of Object.keys(room.sockets)) {
          io.sockets.sockets[client].disconnect();
        }
    }
    console.log("after closing room: ", room_name, " : ", io.sockets.adapter.rooms);
  });

  socket.on('ipaddr', function() {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
          socket.emit('ipaddr', details.address);
        }
      });
    }
  });
});
