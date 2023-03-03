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

// TODO Turn server impl https://www.metered.ca/tools/openrelay/
var pcConfig = {
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

function maybePlayYt(videoTime) {
  if (remoteYtLoaded && localYtLoaded && ytInitiator) {
    remoteYtLoaded = false;
    localYtLoaded = false;
    ytInitiator = false;
    let playTime = Date.now() + 5000;
    sendTextData("!play-yt " + playTime.toString() + " " + videoTime.toString());
    playInFuture(playTime, videoTime);
  }
}

function playInFuture(msecs, videoTime) {
    player.fastSeek(videoTime);
    player.pause();
    setTimeout(() => {
      playButton.innerText = 'Pause';
      playButton.disabled = false;
      player.play();
      ytInitiator = false;
      remoteYtLoaded = false;
      localYtLoaded = false;
    }, msecs - Date.now());
}

const loadCmd = "!load-yt ";

function scanRecvForCommand(text) {
  if (text.startsWith(loadCmd)) {
    let url = new URL(text.slice(loadCmd.length))
    console.log(url);
    let video = url.searchParams.get('v');
    let time = url.searchParams.get('t');
    if (url.hostname === 'www.youtube.com') {
      ytInitiator = false;
      loadYT(video, time ? time : 0);
    }
  } else if (text.startsWith("!ack-yt")) {
    remoteYtLoaded = true;
    maybePlayYt(0);
  } else if (text.startsWith("!play-yt ")) {
    let [playTime, videoTime] = text.slice("!play-yt ".length).split(" ");
    playInFuture(parseInt(playTime), parseFloat(videoTime));
  } else if (text.startsWith("!pause")) {
    playButton.innerText = 'Play';
    player.pause();
    player.fastSeek(parseInt(text.slice("!pause ".length).split(" ")));
  }
}

function scanSendForCommand(text) {
  if (text.startsWith(loadCmd)) {
    let url = new URL(text.slice(loadCmd.length))
    console.log(url);
    let video = url.searchParams.get('v');
    let time = url.searchParams.get('t');
    if (url.hostname === 'www.youtube.com') {
      ytInitiator = true;
      loadYT(video, time ? time : 0);
    }
  }
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

let player = document.getElementById("media-player");

function loadYT(video, time) {
  fetch("https://pipedapi.kavin.rocks/streams/" + video)
    .then((response) => response.json())
    .then((data) => {
      let url = data.videoStreams[0].url;
      console.log("setting video source to:", url);
      player.src = url;
      player.pause();
      player.fastSeek(time);
      playButton.disabled = false;
      if (ytInitiator) {
        localYtLoaded = true;
        maybePlayYt(time);
      } else {
        sendTextData("!ack-yt");
      }
    });
}

let playButton = document.querySelector('#playButton');
playButton.onclick = playCallback;
playButton.disabled = true;

function playCallback() {
  if (playButton.innerText === 'Play') {
    playButton.innerText = 'Pause';
    playButton.disabled = true;
    let videoTime = player.currentTime;
    let playTime = Date.now() + 5000;
    sendTextData("!play-yt " + playTime.toString() + " " + videoTime.toString());
    playInFuture(playTime, videoTime);
  } else if (playButton.innerText === 'Pause') {
    playButton.innerText = 'Play';
    let videoTime = player.currentTime;
    player.pause();
    sendTextData('!pause ' + videoTime.toString());
  }
}
