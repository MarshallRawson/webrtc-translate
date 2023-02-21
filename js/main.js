'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
let sendChannel;
let receiveChannel;
let dataChannelReceive = document.querySelector('textarea#dataChannelReceive');
let dataChannelSend = document.querySelector('textarea#dataChannelSend');
dataChannelSend.value = '!load-yt https://www.youtube.com/watch?v=G8nNGk6LHaM';
let closeButton = document.querySelector('#closeButton');
closeButton.onclick = closeRoom;
let sendButton = document.querySelector('button#sendButton');
sendButton.onclick = sendData;
let chatHistory = document.getElementById('chatHistory');
let playButton = document.querySelector('#playButton');
playButton.onclick = playCallback;
playButton.disabled = true;
var player;

// TODO Turn server impl https://www.metered.ca/tools/openrelay/
var pcConfig = null;{
  'iceServers': [{
    'urls': 'stun:stun.l.google.com:19302'
  }]
};

var sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

let room = new URLSearchParams(window.location.search).get("room");
if (!room) {
  room = prompt("Enter room name:");
  let params = new URLSearchParams(window.location.search);
  params.set('room', room);
  window.location.search = params.toString();
}

var socket = io.connect();

if (room !== "") {
  console.log('Message from client: Asking to join room ' + room);
  socket.emit('create or join', room);
}

socket.on('created', function(room, clientId) {
  console.log('created room: ', room)
  isInitiator = true;
});

socket.on('full', function(room) {
  console.log('Message from client: Room ' + room + ' is full :^(');
});

socket.on('join', function(room) {
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function(room, clientId) {
  console.log('joined: ' + room);
  isChannelReady = true;
});

socket.on('closing room', function() {
    closeButton.disabled = true;
});

function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', room, message);
}

socket.on('message', function(message) {
  console.log('Client received message:', message);
  if (message === 'got user media') {
    maybeStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      maybeStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const mediaStreamConstraints = {
      video: true,
};

navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
    .then(gotStream)
    .catch(function(e) {
        alert('getUserMedia() error: ' + e);
    });

function gotStream(mediaStream) {
  localVideo.srcObject = mediaStream;
  localStream = mediaStream;
  console.log('Received local stream.');
  sendMessage('got user media');
  if (isInitiator) {
    maybeStart();
  }
}

function maybeStart() {
  console.log('>>>>>>> maybeStart() ', isStarted, typeof localStream, isChannelReady);
  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

function closeRoom() {
  socket.emit('close room', room);
}


window.onbeforeunload = function() {
  sendMessage('bye');
};

function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(null);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.ondatachannel = receiveChannelCallback;
    pc.onremovestream = handleRemoteStreamRemoved;
    sendChannel = pc.createDataChannel('sendDataChannel', null);
    sendChannel.onopen = onSendChannelStateChange;
    sendChannel.onclose = onSendChannelStateChange;
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(sessionDescription) {
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  console.log('Failed to create session description: ' + error.toString());
}


function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

function stop() {
  isStarted = false;
  pc.close();
  pc = null;
}

function receiveChannelCallback(event) {
  receiveChannel = event.channel;
  receiveChannel.onmessage = onReceiveMessageCallback;
  receiveChannel.onopen = onReceiveChannelStateChange;
  receiveChannel.onclose = onReceiveChannelStateChange;
}

function onReceiveMessageCallback(event) {
  let p = document.createElement("p");
  p.innerHTML = event.data;
  scanRecvForCommand(event.data);
  p.style = "text-align:left;";
  chatHistory.append(p);
}


function onReceiveChannelStateChange() {
  var readyState = receiveChannel.readyState;
  console.log('Receive channel state is: ' + readyState);
}

function sendData() {
  var data = dataChannelSend.value;
  sendTextData(data);
  dataChannelSend.value = "";
}

function sendTextData(data) {
  scanSendForCommand(data);
  sendChannel.send(data);
  let p = document.createElement("p");
  p.innerHTML = data;
  p.style = "text-align:right;";
  chatHistory.append(p);
  console.log('Sent Data: ' + data);
}

var ytInitiator = false;
var remoteYtLoaded = false;
var localYtLoaded = false;

function maybePlayYt() {
  console.log("maybe !play-yt", remoteYtLoaded, localYtLoaded, ytInitiator);
  if (remoteYtLoaded && localYtLoaded && ytInitiator) {
    remoteYtLoaded = false;
    localYtLoaded = false;
    ytInitiator = false;
    let playTime = Date.now() + 5000;
    sendTextData("!play-yt " + playTime.toString());
    playInFuture(playTime);
  }
}

function playInFuture(msecs) {
    setTimeout(() => {
      player.playVideo();
    }, msecs - Date.now());
}

function scanRecvForCommand(text) {
  scanForCommand(text);
  if (text.startsWith("!ack-yt")) {
    remoteYtLoaded = true;
    maybePlayYt();
  } else if (text.startsWith("!play-yt ")) {
    playInFuture(parseInt(text.slice("!play-yt ".length)));
  }
}

function scanSendForCommand(text) {
  if (scanForCommand(text)) {
    ytInitiator = true;
  }
  console.log("sent: ", text);
  console.log("is yt init:", ytInitiator);
  if (text.startsWith("!ack-yt")) {
    console.log("sent Ack!");
    localYtLoaded = true;
    maybePlayYt();
  }
}

function scanForCommand(text) {
  console.log("scanning:", text);
  let loadCmd = "!load-yt ";
  if (text.startsWith(loadCmd)) {
    let url = new URL(text.slice(loadCmd.length))
    console.log(url);
    let video = url.searchParams.get('v');
    if (video && url.hostname === 'www.youtube.com') {
      loadYT(video);
    }
    return true;
  }
  return false;
}

function onSendChannelStateChange() {
  let readyState = sendChannel.readyState;
  console.log('Send channel state is: ' + readyState);
  if (readyState === 'open') {
    dataChannelSend.disabled = false;
    sendButton.disabled = false;
    dataChannelSend.focus();
    sendButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
  }
}

function loadYT(video) {
  player = new YT.Player('video-placeholder', {
    width: 600,
    height: 400,
    videoId: video,
    playerVars: {
      color: 'white',
    },
    events: {
      onReady: () => { sendTextData("!ack-yt"); }
    }
  });
}

function playCallback() {
  player.playVideo();
}

