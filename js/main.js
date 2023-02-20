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

var room = "foo";//prompt("Enter room name:");

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

socket.on('log', function(array) {
  console.log.apply(console, array);
});

function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
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
  console.trace('Received local stream.');
  startButton.disabled = false;
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
  console.trace('Failed to create session description: ' + error.toString());
}


function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye');
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
  dataChannelReceive.value = event.data;
}

function onReceiveChannelStateChange() {
  var readyState = receiveChannel.readyState;
  console.trace('Receive channel state is: ' + readyState);
}



















//let remoteStream;
//let localPeerConnection;
//let remotePeerConnection;
//
//let dataChannelSend = document.querySelector('textarea#dataChannelSend');
//let dataChannelReceive = document.querySelector('textarea#dataChannelReceive');
//let sendButton = document.querySelector('button#sendButton');
//sendButton.onclick = sendData;
//let closeButton = document.querySelector('button#closeButton');
//closeButton.onclick = closeDataChannels;
//
//function sendData() {
//  var data = dataChannelSend.value;
//  sendChannel.send(data);
//  trace('Sent Data: ' + data);
//}
//
//
//function closeDataChannels() {
//  trace('Closing data channels');
//  sendChannel.close();
//  trace('Closed data channel with label: ' + sendChannel.label);
//  receiveChannel.close();
//  trace('Closed data channel with label: ' + receiveChannel.label);
//  localPeerConnection.close();
//  remotePeerConnection.close();
//  localPeerConnection = null;
//  remotePeerConnection = null;
//  trace('Closed peer connections');
//  startButton.disabled = false;
//  sendButton.disabled = true;
//  closeButton.disabled = true;
//  dataChannelSend.value = '';
//  dataChannelReceive.value = '';
//  dataChannelSend.disabled = true;
//}
//
//// Sets the MediaStream as the video element src.
//
//// Handles error by logging a message to the console.
//function handleLocalMediaStreamError(error) {
//  trace(`navigator.getUserMedia error: ${error.toString()}.`);
//}
//
//// Handles remote MediaStream success by adding it as the remoteVideo src.
//
//
//// Add behavior for video streams.
//
//// Logs a message with the id and size of a video element.
//function logVideoLoaded(event) {
//  const video = event.target;
//  trace(`${video.id} videoWidth: ${video.videoWidth}px, ` +
//    `videoHeight: ${video.videoHeight}px.`);
//}
//
//// Logs a message with the id and size of a video element.
//// This event is fired when video begins streaming.
//function logResizedVideo(event) {
//  logVideoLoaded(event);
//
//  if (startTime) {
//  const elapsedTime = window.performance.now() - startTime;
//  startTime = null;
//  trace(`Setup time: ${elapsedTime.toFixed(3)}ms.`);
//  }
//}
//
//localVideo.addEventListener('loadedmetadata', logVideoLoaded);
//remoteVideo.addEventListener('loadedmetadata', logVideoLoaded);
//remoteVideo.addEventListener('onresize', logResizedVideo);
//
//
//// Define RTC peer connection behavior.
//
//// Connects with new peer candidate.
//function handleConnection(event) {
//  const peerConnection = event.target;
//  const iceCandidate = event.candidate;
//
//  if (iceCandidate) {
//  const newIceCandidate = new RTCIceCandidate(iceCandidate);
//  const otherPeer = getOtherPeer(peerConnection);
//
//  otherPeer.addIceCandidate(newIceCandidate)
//    .then(() => {
//    handleConnectionSuccess(peerConnection);
//    }).catch((error) => {
//    handleConnectionFailure(peerConnection, error);
//    });
//
//  trace(`${getPeerName(peerConnection)} ICE candidate:\n` +
//      `${event.candidate.candidate}.`);
//  }
//}
//
//// Logs that the connection succeeded.
//function handleConnectionSuccess(peerConnection) {
//  trace(`${getPeerName(peerConnection)} addIceCandidate success.`);
//};
//
//// Logs that the connection failed.
//function handleConnectionFailure(peerConnection, error) {
//  trace(`${getPeerName(peerConnection)} failed to add ICE Candidate:\n`+
//    `${error.toString()}.`);
//}
//
//// Logs changes to the connection state.
//function handleConnectionChange(event) {
//  const peerConnection = event.target;
//  console.log('ICE state change event: ', event);
//  trace(`${getPeerName(peerConnection)} ICE state: ` +
//    `${peerConnection.iceConnectionState}.`);
//}
//
//// Logs error when setting session description fails.
//function setSessionDescriptionError(error) {
//  trace(`Failed to create session description: ${error.toString()}.`);
//}
//
//// Logs success when setting session description.
//function setDescriptionSuccess(peerConnection, functionName) {
//  const peerName = getPeerName(peerConnection);
//  trace(`${peerName} ${functionName} complete.`);
//}
//
//// Logs success when localDescription is set.
//function setLocalDescriptionSuccess(peerConnection) {
//  setDescriptionSuccess(peerConnection, 'setLocalDescription');
//}
//
//// Logs success when remoteDescription is set.
//function setRemoteDescriptionSuccess(peerConnection) {
//  setDescriptionSuccess(peerConnection, 'setRemoteDescription');
//}
//
//// Logs offer creation and sets peer connection session descriptions.
//function createdOffer(description) {
//  trace(`Offer from localPeerConnection:\n${description.sdp}`);
//
//  trace('localPeerConnection setLocalDescription start.');
//  localPeerConnection.setLocalDescription(description)
//  .then(() => {
//    setLocalDescriptionSuccess(localPeerConnection);
//  }).catch(setSessionDescriptionError);
//
//  trace('remotePeerConnection setRemoteDescription start.');
//  remotePeerConnection.setRemoteDescription(description)
//  .then(() => {
//    setRemoteDescriptionSuccess(remotePeerConnection);
//  }).catch(setSessionDescriptionError);
//
//  trace('remotePeerConnection createAnswer start.');
//  remotePeerConnection.createAnswer()
//  .then(createdAnswer)
//  .catch(setSessionDescriptionError);
//}
//
//// Logs answer to offer creation and sets peer connection session descriptions.
//function createdAnswer(description) {
//  trace(`Answer from remotePeerConnection:\n${description.sdp}.`);
//
//  trace('remotePeerConnection setLocalDescription start.');
//  remotePeerConnection.setLocalDescription(description)
//  .then(() => {
//    setLocalDescriptionSuccess(remotePeerConnection);
//  }).catch(setSessionDescriptionError);
//
//  trace('localPeerConnection setRemoteDescription start.');
//  localPeerConnection.setRemoteDescription(description)
//  .then(() => {
//    setRemoteDescriptionSuccess(localPeerConnection);
//  }).catch(setSessionDescriptionError);
//}
//
//
//// Define and add behavior to buttons.
//
//// Define action buttons.
//const startButton = document.getElementById('startButton');
//const callButton = document.getElementById('callButton');
//const hangupButton = document.getElementById('hangupButton');
//
//// Set up initial action buttons status: disable call and hangup.
//startButton.disabled = true;
//callButton.disabled = true;
//hangupButton.disabled = true;
//
//
//// Handles start button action: creates local MediaStream.
//function startAction() {
//  startButton.disabled = true;
//  trace('Requesting local stream.');
//
//  startTime = window.performance.now();
//  // Get local media stream tracks.
//  const videoTracks = localStream.getVideoTracks();
//  const audioTracks = localStream.getAudioTracks();
//  if (videoTracks.length > 0) {
//  trace(`Using video device: ${videoTracks[0].label}.`);
//  }
//  if (audioTracks.length > 0) {
//  trace(`Using audio device: ${audioTracks[0].label}.`);
//  }
//
//  const servers = null;  // Allows for RTC server configuration.
//  const dataConstraint = null;
//
//  // Create peer connections and add behavior.
//  localPeerConnection = new RTCPeerConnection(servers);
//  trace('Created local peer connection object localPeerConnection.');
//  sendChannel = localPeerConnection.createDataChannel('sendDataChannel', dataConstraint);
//  localPeerConnection.onicecandidate = iceCallback1;
//  sendChannel.onopen = onSendChannelStateChange;
//  sendChannel.onclose = onSendChannelStateChange;
//
//  localPeerConnection.addEventListener(
//  'iceconnectionstatechange', handleConnectionChange);
//
//  remotePeerConnection = new RTCPeerConnection(servers);
//  trace('Created remote peer connection object remotePeerConnection.');
//
//  remotePeerConnection.onicecandidate = iceCallback2;
//  remotePeerConnection.addEventListener(
//  'iceconnectionstatechange', handleConnectionChange);
//  remotePeerConnection.addEventListener('addstream', gotRemoteMediaStream);
//  remotePeerConnection.ondatachannel = receiveChannelCallback;
//
//  // Add local stream to connection and create offer to connect.
//  localPeerConnection.addStream(localStream);
//  trace('Added local stream to localPeerConnection.');
//  callButton.disabled = false;
//}
//
//function onSendChannelStateChange() {
//  let readyState = sendChannel.readyState;
//  trace('Send channel state is: ' + readyState);
//  if (readyState === 'open') {
//  dataChannelSend.disabled = false;
//  dataChannelSend.focus();
//  sendButton.disabled = false;
//  closeButton.disabled = false;
//  } else {
//  dataChannelSend.disabled = true;
//  sendButton.disabled = true;
//  closeButton.disabled = true;
//  }
//}
//
//
//
//
//function iceCallback1(event) {
//  trace('local ice callback');
//  if (event.candidate) {
//  remotePeerConnection.addIceCandidate(
//    event.candidate
//  ).then(
//    onAddIceCandidateSuccess,
//    onAddIceCandidateError
//  );
//  trace('Local ICE candidate: \n' + event.candidate.candidate);
//  }
//}
//
//function iceCallback2(event) {
//  trace('remote ice callback');
//  if (event.candidate) {
//  localPeerConnection.addIceCandidate(
//    event.candidate
//  ).then(
//    onAddIceCandidateSuccess,
//    onAddIceCandidateError
//  );
//  trace('Remote ICE candidate: \n ' + event.candidate.candidate);
//  }
//}
//
//// Handles call button action: creates peer connection.
//function callAction() {
//  callButton.disabled = true;
//  hangupButton.disabled = false;
//  trace('Starting call.');
//
//  trace('localPeerConnection createOffer start.');
//  localPeerConnection.createOffer()// TODO offerOptions)
//  .then(createdOffer).catch(setSessionDescriptionError);
//}
//
//// Handles hangup action: ends up call, closes connections and resets peers.
//function hangupAction() {
//  localPeerConnection.close();
//  remotePeerConnection.close();
//  localPeerConnection = null;
//  remotePeerConnection = null;
//  hangupButton.disabled = true;
//  startButton.disabled = false;
//  trace('Ending call.');
//}
//
//// Add click event handlers for buttons.
//startButton.addEventListener('click', startAction);
//callButton.addEventListener('click', callAction);
//hangupButton.addEventListener('click', hangupAction);
//
//
//// Define helper functions.
//
//// Gets the "other" peer connection.
//function getOtherPeer(peerConnection) {
//  return (peerConnection === localPeerConnection) ?
//    remotePeerConnection : localPeerConnection;
//}
//
//// Gets the name of a certain peer connection.
//function getPeerName(peerConnection) {
//  return (peerConnection === localPeerConnection) ?
//    'localPeerConnection' : 'remotePeerConnection';
//}
//
//// Logs an action (text) and the time when it happened on the console.
//function trace(text) {
//  text = text.trim();
//  const now = (window.performance.now() / 1000).toFixed(3);
//
//  console.log(now, text);
//}
//
//function onAddIceCandidateSuccess() {
//  trace('AddIceCandidate success.');
//}
//
//function onAddIceCandidateError(error) {
//  trace('Failed to add Ice Candidate: ' + error.toString());
//}
//
