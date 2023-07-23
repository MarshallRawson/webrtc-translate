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
      player.addEventListener('canplay', () => {
        if (ytInitiator) {
          localYtLoaded = true;
          maybePlayYt(time);
        } else {
          sendTextData("!ack-yt");
        }
      });
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




var langs =
	[['Afrikaans',       ['af-ZA']],
		 ['Bahasa Indonesia',['id-ID']],
		 ['Bahasa Melayu',   ['ms-MY']],
		 ['Català',          ['ca-ES']],
		 ['Čeština',         ['cs-CZ']],
		 ['Deutsch',         ['de-DE']],
		 ['English',         ['en-AU', 'Australia'],
			                      ['en-CA', 'Canada'],
			                      ['en-IN', 'India'],
			                      ['en-NZ', 'New Zealand'],
			                      ['en-ZA', 'South Africa'],
			                      ['en-GB', 'United Kingdom'],
			                      ['en-US', 'United States']],
		 ['Español',         ['es-AR', 'Argentina'],
			                      ['es-BO', 'Bolivia'],
			                      ['es-CL', 'Chile'],
			                      ['es-CO', 'Colombia'],
			                      ['es-CR', 'Costa Rica'],
			                      ['es-EC', 'Ecuador'],
			                      ['es-SV', 'El Salvador'],
			                      ['es-ES', 'España'],
			                      ['es-US', 'Estados Unidos'],
			                      ['es-GT', 'Guatemala'],
			                      ['es-HN', 'Honduras'],
			                      ['es-MX', 'México'],
			                      ['es-NI', 'Nicaragua'],
			                      ['es-PA', 'Panamá'],
			                      ['es-PY', 'Paraguay'],
			                      ['es-PE', 'Perú'],
			                      ['es-PR', 'Puerto Rico'],
			                      ['es-DO', 'República Dominicana'],
			                      ['es-UY', 'Uruguay'],
			                      ['es-VE', 'Venezuela']],
		 ['Euskara',         ['eu-ES']],
		 ['Français',        ['fr-FR']],
		 ['Galego',          ['gl-ES']],
		 ['Hrvatski',        ['hr_HR']],
		 ['IsiZulu',         ['zu-ZA']],
		 ['Íslenska',        ['is-IS']],
		 ['Italiano',        ['it-IT', 'Italia'],
			                      ['it-CH', 'Svizzera']],
		 ['Magyar',          ['hu-HU']],
		 ['Nederlands',      ['nl-NL']],
		 ['Norsk bokmål',    ['nb-NO']],
		 ['Polski',          ['pl-PL']],
		 ['Português',       ['pt-BR', 'Brasil'],
			                      ['pt-PT', 'Portugal']],
		 ['Română',          ['ro-RO']],
		 ['Slovenčina',      ['sk-SK']],
		 ['Suomi',           ['fi-FI']],
		 ['Svenska',         ['sv-SE']],
		 ['Türkçe',          ['tr-TR']],
		 ['български',       ['bg-BG']],
		 ['Pусский',         ['ru-RU']],
		 ['Српски',          ['sr-RS']],
		 ['한국어',            ['ko-KR']],
		 ['中文',             ['cmn-Hans-CN', '普通话 (中国大陆)'],
			                      ['cmn-Hans-HK', '普通话 (香港)'],
			                      ['cmn-Hant-TW', '中文 (台灣)'],
			                      ['yue-Hant-HK', '粵語 (香港)']],
		 ['日本語',           ['ja-JP']],
		 ['Lingua latīna',   ['la']]];

for (var i = 0; i < langs.length; i++) {
	  select_language.options[i] = new Option(langs[i][0], i);
}
select_language.selectedIndex = 6;
updateCountry();
select_dialect.selectedIndex = 6;
showInfo('info_start');

function updateCountry() {
	  for (var i = select_dialect.options.length - 1; i >= 0; i--) {
		      select_dialect.remove(i);
		    }
	  var list = langs[select_language.selectedIndex];
	  for (var i = 1; i < list.length; i++) {
		      select_dialect.options.add(new Option(list[i][1], list[i][0]));
		    }
	  select_dialect.style.visibility = list[1].length == 1 ? 'hidden' : 'visible';
}

var create_email = false;
var final_transcript = '';
var recognizing = false;
var ignore_onend;
var start_timestamp;
if (!('webkitSpeechRecognition' in window)) {
	  upgrade();
} else {
	  start_button.style.display = 'inline-block';
	  var recognition = new webkitSpeechRecognition();
	  recognition.continuous = true;
	  recognition.interimResults = true;

	  recognition.onstart = function() {
		      recognizing = true;
		      showInfo('info_speak_now');
		      //start_img.src = 'mic-animate.gif';
		    };

	  recognition.onerror = function(event) {
		      if (event.error == 'no-speech') {
			            //start_img.src = 'mic.gif';
			            showInfo('info_no_speech');
			            ignore_onend = true;
			          }
		      if (event.error == 'audio-capture') {
			            //start_img.src = 'mic.gif';
			            showInfo('info_no_microphone');
			            ignore_onend = true;
			          }
		      if (event.error == 'not-allowed') {
			            if (event.timeStamp - start_timestamp < 100) {
					            showInfo('info_blocked');
					          } else {
							          showInfo('info_denied');
							        }
			            ignore_onend = true;
			          }
		    };

	  recognition.onend = function() {
		      recognizing = false;
		      if (ignore_onend) {
			            return;
			          }
		      //start_img.src = 'mic.gif';
		      if (!final_transcript) {
			            showInfo('info_start');
			            return;
			          }
		      showInfo('');
		      if (window.getSelection) {
			            window.getSelection().removeAllRanges();
			            var range = document.createRange();
			            range.selectNode(document.getElementById('final_span'));
			            window.getSelection().addRange(range);
			          }
		      if (create_email) {
			            create_email = false;
			            createEmail();
			          }
		    };

	  recognition.onresult = function(event) {
		      var interim_transcript = '';
		      for (var i = event.resultIndex; i < event.results.length; ++i) {
			            if (event.results[i].isFinal) {
					            final_transcript += event.results[i][0].transcript;
					          } else {
							          interim_transcript += event.results[i][0].transcript;
							        }
			          }
		      final_transcript = capitalize(final_transcript);
		      final_span.innerHTML = linebreak(final_transcript);
		      interim_span.innerHTML = linebreak(interim_transcript);
		      if (final_transcript || interim_transcript) {
			            showButtons('inline-block');
			          }
		    };
}

function upgrade() {
	  start_button.style.visibility = 'hidden';
	  showInfo('info_upgrade');
}

var two_line = /\n\n/g;
var one_line = /\n/g;
function linebreak(s) {
	  return s.replace(two_line, '<p></p>').replace(one_line, '<br>');
}

var first_char = /\S/;
function capitalize(s) {
	  return s.replace(first_char, function(m) { return m.toUpperCase(); });
}

function createEmail() {
	  var n = final_transcript.indexOf('\n');
	  if (n < 0 || n >= 80) {
		      n = 40 + final_transcript.substring(40).indexOf(' ');
		    }
	  var subject = encodeURI(final_transcript.substring(0, n));
	  var body = encodeURI(final_transcript.substring(n + 1));
	  window.location.href = 'mailto:?subject=' + subject + '&body=' + body;
}

function copyButton() {
	  if (recognizing) {
		      recognizing = false;
		      recognition.stop();
		    }
	  copy_button.style.display = 'none';
	  copy_info.style.display = 'inline-block';
	  showInfo('');
}

function emailButton() {
	  if (recognizing) {
		      create_email = true;
		      recognizing = false;
		      recognition.stop();
		    } else {
			        createEmail();
			      }
	  email_button.style.display = 'none';
	  email_info.style.display = 'inline-block';
	  showInfo('');
}

function startButton(event) {
	  if (recognizing) {
		      recognition.stop();
		      return;
		    }
	  final_transcript = '';
	  recognition.lang = select_dialect.value;
	  recognition.start();
	  ignore_onend = false;
	  final_span.innerHTML = '';
	  interim_span.innerHTML = '';
	  //start_img.src = 'mic-slash.gif';
	  showInfo('info_allow');
	  showButtons('none');
	  start_timestamp = event.timeStamp;
}

function showInfo(s) {
	  if (s) {
		      for (var child = info.firstChild; child; child = child.nextSibling) {
			            if (child.style) {
					            child.style.display = child.id == s ? 'inline' : 'none';
					          }
			          }
		      info.style.visibility = 'visible';
		    } else {
			        info.style.visibility = 'hidden';
			      }
}

var current_style;
function showButtons(style) {
	  if (style == current_style) {
		      return;
		    }
	  current_style = style;
	  //copy_button.style.display = style;
	  //email_button.style.display = style;
	  //copy_info.style.display = 'none';
	  //email_info.style.display = 'none';
}

