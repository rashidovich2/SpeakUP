// localStorage wrapper
var LS = {
	prefix: 'link_speakup_',

	get: function (key) {
		return localStorage.getItem(this.prefix + key);
	},

	set: function (key, value) {
		return localStorage.setItem(this.prefix + key, value);
	},

	del: function (key) {
		return localStorage.removeItem(this.prefix + key);
	}
}

// Event Logger
var EventLogger = {
	enabled: true,
	address: '/logger.php',
	duplicateInGA: true,
	
	log: function(eventName) {
		if (!eventName) return;
		if (!this.enabled) return;
		
		$.ajax({
			method: 'POST',
			url: this.address,
			data: {
				'event': eventName,
				'ver': Config.version
			},
			dataType: 'json'
		});
		
		if (typeof ga == 'function' && this.duplicateInGA) {
			ga('send', 'event', 'speakup', eventName);
		}
	}
}

// grab the room from the URL
var roomInAddr = location.pathname && location.pathname.match("/c/([a-zA-Z0-9\-_]{2,})");
var videoCount = 0;
var alertsCount = 0;
var muteActive = false;
var initFailed = false;
var settingsNeedReload = false;
var snMode = (typeof window.node != 'undefined'); // Client for Electron
var initFailedTimer;
var currentTime = 1*(new Date());
var unreadMessages = 0;
var notificationTimeout = 3000;
var callModeEnabled = false;

// call configuration
var Config = {
	nick: '',
	room: '',
	staticPath: ''
}

// create our webrtc connection
var webrtc;

// webcam settings
var audioDevices = [], videoDevices = [];

// detecting all media devices
function enumerateDevices(callback){
	var fixLabel = function(sourceInfo, num) {
		if (sourceInfo.deviceId === 'default') {
			return "System Default";
		}
		
		if (sourceInfo.deviceId === 'communications') {
			return "Default Device for Communication";
		}
		
		if (sourceInfo.kind === 'audioinput' && sourceInfo.label.length === 0) {
			return "Microphone #" + num;
		}
		
		if (sourceInfo.kind === 'videoinput' && sourceInfo.label.length === 0) {
			return "Camera #" + num;
		}
		
		return (sourceInfo.label) ? sourceInfo.label : "Device #" + num;
	}
	
	if (initFailed) return;

	audioDevices = [];
	videoDevices = [];
	$('#audioDeviceSelector').empty();
	$('#videoDeviceSelector').empty();

	if (!(navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection)) {
		oldBrowser();
	} else {
		navigator.mediaDevices.enumerateDevices().then(function(devices) {
			var selectedAudioDevice = LS.get("device_audio") || false;
			var selectedVideoDevice = LS.get("device_video") || false;

			if (selectedVideoDevice && selectedVideoDevice == "off") {
				$('#videoDeviceSelector').append("<option selected value='off'>Disabled</option>");
			} else {
				$('#videoDeviceSelector').append("<option value='off'>Disabled</option>");
			}

			for (var i = 0; i !== devices.length; ++i) {
				var sourceInfo = devices[i];
				
				if (sourceInfo.kind === 'audioinput') {
					sourceInfo.labelMod = fixLabel(sourceInfo, audioDevices.length + 1);
					audioDevices.push(sourceInfo);

					if (selectedAudioDevice && selectedAudioDevice == sourceInfo.deviceId) {
						$('#audioDeviceSelector').append("<option selected value='" + sourceInfo.deviceId + "'>" + sourceInfo.labelMod + "</option>");
					} else {
						$('#audioDeviceSelector').append("<option value='" + sourceInfo.deviceId + "'>" + sourceInfo.labelMod + "</option>");
					}
				} else if (sourceInfo.kind === 'videoinput') {
					sourceInfo.labelMod = fixLabel(sourceInfo, audioDevices.length + 1);
					videoDevices.push(sourceInfo);

					if (selectedVideoDevice && selectedVideoDevice == sourceInfo.deviceId) {
						$('#videoDeviceSelector').append("<option selected value='" + sourceInfo.deviceId + "'>" + sourceInfo.labelMod + "</option>");
					} else {
						$('#videoDeviceSelector').append("<option value='" + sourceInfo.deviceId + "'>" + sourceInfo.labelMod + "</option>");
					}
				}
			}

			if (callback) {
				callback();
			}
		});
	}
}

// replacing alert with onpage popups
function alert(text, type, timeout){
	var type = type || 'info';
	var timeout = timeout || 5000;
	alertsCount++;
	if (type=='error') type='danger';

	$('#alert-container').append("<div class='alert alert-" + type +
									"' id='alert-" + alertsCount +
									"' style='display:none'>" + text + "</div>");

	$('#alert-' + alertsCount).slideDown('fast').on('click', function(){
		$(this).slideUp('fast', function(){
			$(this).remove();
		});
	});

	var tempAlertId = alertsCount;
	if (timeout > 0){
		setTimeout(function(){
			$('#alert-' + tempAlertId).slideUp('fast', function(){
				$(this).remove();
			});
		}, timeout);
	}

	return true;
}

var NotificationWrapper = function (argTitle, argText) {
	var title = argTitle;
	var text = argText;
	var timeout = notificationTimeout;
	
	var sendIpc = function() {
		var msg = {
			title : title,
			message : text,
			detail: '',
			width: 400,
			timeout : timeout,
			focus: true
		};

		node.ipcRenderer.send('electron-toaster-message', msg);
	}
	
	var sendBrowser = function() {
		if (Notification.permission === 'granted') {
			var notification = new Notification(title, {
				body: text
			});
			
			setTimeout(function(){
				notification.close();
			}, timeout);
		} else if (Notification.permission !== 'denied') {
			Notification.requestPermission(function (permission) {
				if (permission === 'granted') {
					sendBrowser();
				} else {
					sendAlert();
				}
			});
		}
	}
	
	var sendAlert = function() {
		alert(title + "<br/>" + text, 'info', timeout);
	}
	
	var sendAutoDetect = function() {
		if (snMode) {
			sendIpc();
		} else if (typeof Notification !== 'undefined') {
			sendBrowser();
		} else {
			// browser, why are you so IE?
			sendAlert();
		}
	}
	
	sendAutoDetect();
}

function playSound(name){
	var snd = new Audio(Config.staticPath + "/apps/speakup/sounds/" + name + ".ogg");
	var volCurrent = LS.get('remote_volume') || 1;

	snd.volume = volCurrent;
	snd.play();
}

function showVolume(el, volume) {
	//return;
	if (!el) return;
	if (volume < -50) {
		el.style.backgroundColor = '#79f';
		el.style.boxShadow = '0 0 5px 1px #79f';
	} else if (volume < -40) {
		el.style.backgroundColor = '#0f0';
		el.style.boxShadow = '0 0 7px 1px #0f0';
	} else if (volume < -30) {
		el.style.backgroundColor = '#0f0';
		el.style.boxShadow = '0 0 9px 1px #0f0';
	} else if (volume < -20) {
		el.style.backgroundColor = '#f00';
		el.style.boxShadow = '0 0 12px 1px #f00';
	} else if (volume >= -20) {
		el.style.backgroundColor = '#f00';
		el.style.boxShadow = '0 0 15px 1px #f00';
	}
}

function fixSpecialSymbols(text, onlyLatin){
	var onlyLatin = onlyLatin || false;
	if (onlyLatin) {
		return text.replace(/([^a-zA-Z0-9\-_]*)/g, '').trim();
	} else {
		return text.replace(/</g, "&lt;")
				   .replace(/>/g, "&gt;")
				   .trim();
	}
}

var messageBanner = {
	show: function(text) {
		$('#message').html(text).slideDown('fast');
		$('body').addClass('messagePadding');
	},
	
	hide: function() {
		$('#message').slideUp('fast', function() {
			$(this).html('');
		});
		
		$('body').removeClass('messagePadding');
	},
	
	fatal: function(text, showSettings) {
		initFailed = true;
		$('body').removeClass('active').addClass('loading');
		$('#loader .spinner').hide();
		clearTimeout(initFailedTimer);
		
		if (showSettings) {
			$('#fatalErrorSettings').show();
		} else {
			$('#fatalErrorSettings').hide();
		}
		
		$('#fatalErrorText').html(text);
		$('#fatalError').slideDown('fast');
	}
}

function msgIfEmpty(){
	if (videoCount == 0){
		messageBanner.show('This room is empty');
		if (snMode) {
			speakupClient.disableCallMode();
		} else {
			callModeEnabled = false;
		}
	} else {
		messageBanner.hide();
		if (snMode) {
			speakupClient.enableCallMode();
		} else {
			callModeEnabled = true;
		}
	}
}

function secondsToString(msec) {
	var tDate = new Date(msec);
	
	var hours =   parseInt(tDate.getUTCHours());
	var minutes = parseInt(tDate.getUTCMinutes());
    var seconds = parseInt(tDate.getUTCSeconds());
	
	return (hours == 0 ? '' : ((hours < 10 ? "0" + hours : hours) + ":")) + (minutes < 10 ? "0" + minutes : minutes) + ":" + (seconds  < 10 ? "0" + seconds : seconds);
}

var Chat = {
	visible: false,
	
	logMessage: function(code, toMyself) {
		var className = (toMyself) ? "message-out" : "message-in";
		$('#chatlog').append("<div class='message " + className + "'>" + code + "</div>");
		this.scrollLog();
	},
	
	scrollLog: function() {
		var cHeight = $('#chatlog').height();
		var cScrollHeight = $('#chatlog')[0].scrollHeight;
		var cTop = $('#chatlog').scrollTop();
		var cAllowedOffset = 100;
		
		var cViewBox = cScrollHeight - cHeight - cAllowedOffset;
		
		if (cTop > cViewBox) {
			$('#chatlog').scrollTop(cScrollHeight + cHeight);
		}
	},
	
	parseMessage: function(data, toMyself) {
		if (data.type === 'chat') {
			var msg = fixSpecialSymbols(data.payload.message);
			if (msg.length == 0) return;
			this.logMessage("<b>" + fixSpecialSymbols(data.payload.nick) + "</b><br/>" + msg, (toMyself | false));
			if (!toMyself) {
				playSound('message');
				alert("New message from " + fixSpecialSymbols(data.payload.nick) + ":<br/>" + fixSpecialSymbols(data.payload.message), 'info');
				setUnreadMessages(unreadMessages + 1);
			}
			return;
		}

		if (data.type === 'youtube') {
			var actLink = data.payload.link;
			var ytId = actLink.match(/(v=|embed\/)([a-zA-Z0-9\-_]*)/);
			if (!(ytId != null && ytId[2])) {
				this.logMessage("<b>" + fixSpecialSymbols(data.payload.nick) + "</b><br/>Sent bad YouTube link!");
				return;
			}

			this.logMessage(
				"<b>" + fixSpecialSymbols(data.payload.nick) + "</b><br/>" +
				"<iframe width='100%' height='300' src='https://www.youtube-nocookie.com/embed/" + ytId[2] +
				"?rel=0&amp;controls=1&amp;autoplay=1' frameborder='0' allowfullscreen></iframe>"
			);

			if (!toMyself) {
				playSound('message');
				alert("New video from " + fixSpecialSymbols(data.payload.nick) + "<br/>(open chat to see it)", 'info');
				setUnreadMessages(unreadMessages + 1);
			}
			return;
		}

		if (data.type === 'screamer') {
			var scId = data.payload.id;
			if (!LS.get('disable_screamers')) {
				if (scId === 1 || scId === 2) {
					playSound('scream' + scId);
				}
			}

			var showDelay = 6000;
			switch (scId) {
				case 1: showDelay = 6000; break;
				case 2: showDelay = 4500; break;
				case 3: showDelay = 4500; break;
			}

			if (scId === 3) {
				setTimeout(function() {
					$('#rainbow').addClass('rainbow').show();
					playSound('rainbow');
					setTimeout(function() {
						$('#rainbow').removeClass('rainbow').hide();
					}, 5000);
				}, showDelay);
			} else {
				setTimeout(function() {
					$('#screamer').attr('src', Config.staticPath + '/apps/speakup/images/screamer' + scId + '.jpg');
					$('#screamer').show();
					setTimeout(function() {
						$('#screamer').fadeOut('fast');
					}, 4000);
				}, showDelay);
			}

			return;
		}

		if (data.type === 'updateData') {
			if (!(data.response && data.response.clients)) {
				return;
			}

			var newVideoCount = 0;

			for (var item in data.response.clients) {
				var client = data.response.clients[item];
				var videoInfo = data.videoInfo.clients[item];
				var timeDiff = data.serverTime - client.joinedAt;

				if (client.id != webrtc.connection.connection.id) {
					if (videoInfo.video === true) { newVideoCount++; }
					if (videoInfo.screen === true) { newVideoCount++; }
					var contEl = getVideoByClId(client.id);

					if (contEl) {
						$('#container_' + contEl.id).data('time-joined', client.joinedAt)
								 .addClass('timerEnabled');
					}
				} else {
					$('#ownVideo').data('time-joined', client.joinedAt)
								  .addClass('timerEnabled');
				}
			}
			
			currentTime = data.serverTime;
		}
	},
	
	submitMsg: function() {
		var ptext = $('#compose-input').val();

		if (matches = ptext.match(/^\/command (screamer_enable|screamer_nomore)/)) {
			egg = matches[1];
			if (egg && egg == 'screamer_enable') {
				enableScreamers(true);
			}

			if (egg && egg == 'screamer_nomore') {
				alert("OK, you won't be able to hear screamers", 'info');
				LS.set('disable_screamers', 1);
			}

			$('#compose-input').val('');
			$('#compose-input').focus();
			return;
		}

		if (ptext != "") {
			var dPayload = {nick: webrtc.config.nick, message: ptext};
			webrtc.sendToAll("chat", dPayload);
			var data = {
				type: 'chat',
				payload: dPayload
			}
			this.parseMessage(data, true);

			EventLogger.log('message');
		}

		$('#compose-input').val('');
		$('#compose-input').focus();
	},
	
	showWindow: function() {
		this.visible = true;
		$('#chat').animate({'margin-right': '0'});
		$('#alert-container').animate({'margin-right': '330px'});
		$('#tlb-chat').removeClass('inactive').addClass('active');
		
		setUnreadMessages(0);
	},

	hideWindow: function() {
		this.visible = false;
		$('#chat').animate({'margin-right': '-100%'});
		$('#alert-container').animate({'margin-right': '0'});
		$('#tlb-chat').removeClass('active').addClass('inactive');
	}
}

// returns id of container for peer (for timers)
function getVideoByClId(id) {
	var peers = webrtc.getPeers();
	for (var i = 0; i < peers.length; i++) {
		if (peers[i].id == id) {
			return peers[i].videoEl;
		}
	}
	
	return false;
}

function updateCurrentTime() {
	currentTime += 1000;
}

function updateTimers() {
	$('.timerEnabled').each(function() {
		var timeDiff = currentTime - 
			parseInt($(this).data('time-joined'));
			
		// $(this).children('.statusPanel').attr('title', "Online: " + secondsToString(timeDiff));
		$(this).find('.statusTime').html(secondsToString(timeDiff));
	});
}

function submitLoginForm() {
	var userNick = $('#loginNick').val();
	var userNick = fixSpecialSymbols(userNick, true);

	var userRoom = $('#loginRoom').val();
	var userRoom = fixSpecialSymbols(userRoom, true);

	if (userNick.length == 0) {
		alert("Please, enter your login!", "error");
		return;
	}

	if (userRoom.length == 0) {
		userRoom = generateRandom('room');
		alert("You haven't entered room ID, joining room " + userRoom, "info");
	}

	LS.set("nickname", userNick);
	Config.nick = userNick;
	Config.room = userRoom;
	setRoom(true);
	$('#loginWindow').slideUp('fast');
	$('#loader .spinner').show();
	EventLogger.log('login');
	systemInit();
}

function generateRandom(typeGen) {
    var adjectives = ['autumn', 'hidden', 'bitter', 'misty', 'silent', 'empty', 'dry', 'dark', 'summer', 'icy', 'delicate', 'quiet', 'white', 'cool', 'spring', 'winter', 'patient', 'twilight', 'dawn', 'crimson', 'wispy', 'weathered', 'blue', 'billowing', 'broken', 'cold', 'falling', 'frosty', 'green', 'long', 'late', 'lingering', 'bold', 'little', 'morning', 'muddy', 'old', 'red', 'rough', 'still', 'small', 'sparkling', 'shy', 'wandering', 'withered', 'wild', 'black', 'young', 'holy', 'solitary', 'fragrant', 'aged', 'snowy', 'proud', 'floral', 'restless', 'divine', 'polished', 'ancient', 'purple', 'lively', 'nameless'];

    var nouns = ['waterfall', 'river', 'breeze', 'moon', 'rain', 'wind', 'sea', 'morning', 'snow', 'lake', 'sunset', 'pine', 'shadow', 'leaf', 'dawn', 'glitter', 'forest', 'hill', 'cloud', 'meadow', 'sun', 'glade', 'bird', 'brook', 'butterfly', 'bush', 'dew', 'dust', 'field', 'fire', 'flower', 'firefly', 'feather', 'grass', 'haze', 'mountain', 'night', 'pond', 'darkness', 'snowflake', 'silence', 'sound', 'sky', 'shape', 'surf', 'thunder', 'violet', 'water', 'wildflower', 'wave', 'water', 'resonance', 'sun', 'wood', 'dream', 'cherry', 'tree', 'fog', 'frost', 'voice', 'paper', 'frog', 'smoke', 'star'];

    var random = function (arr) {
        return arr[Math.floor(Math.random()*arr.length)];
    };

	if (typeGen == 'room') {
		var adjective = random(adjectives);
		var noun = random(nouns);
		return [adjective, noun].join('-');
	} else if (typeGen == 'nick') {
		return "user-" + Math.floor(Math.random() * 8999 + 1000);
	}
}

function showLoginWindow() {
	var nick = (!Config.nick || Config.nick.length == 0) ? generateRandom('nick') : Config.nick;
	var room = (!Config.room || Config.room.length <= 1) ? generateRandom('room') : Config.room;
	
	clearTimeout(initFailedTimer);

	$('#loginNick').val(nick);
	$('#loginRoom').val(room);

	$('#loader .spinner').hide();
	$('.modal').slideUp('fast');
	$('#loginWindow').slideDown('fast');
	$('#loginForm').unbind('submit').on('submit', function(e) {
		e.preventDefault();
		submitLoginForm();
	});
}

function removeVideo(id, error) {
	if (!id) {
		$('#remotes .videoContainer').remove();
	} else {
		$('#container_' + id).remove();
	}

	if (error) {
		playSound('error');
	} else {
		playSound('user_leave');
	}

	videoCount--;
	msgIfEmpty();
}

function prepareCall() {
	if (initFailed) return;

	var mediaOptions = {
		audio: false,
		video: false
	};

	var selectedAudioDevice = LS.get("device_audio") || false;
	var selectedVideoDevice = LS.get("device_video") || false;

	if (!selectedAudioDevice) {
		selectedAudioDevice = (audioDevices[0] && audioDevices[0].deviceId) ? audioDevices[0].deviceId : false;
	}

	if (!selectedVideoDevice) {
		selectedVideoDevice = (audioDevices[0] && audioDevices[0].deviceId) ? audioDevices[0].deviceId : false;
	}

	if (selectedAudioDevice) {
		mediaOptions.audio = {
			mandatory:
				{
					sourceId: selectedAudioDevice
				}
		};

		LS.set("device_audio", selectedAudioDevice);
		$('#audioDeviceSelector option').removeAttr('selected');
		$('#audioDeviceSelector').val(selectedAudioDevice);
	} else {
		mediaOptions.audio = true;
	}

	var optionalQuality = [];
	if (LS.get("enable_hd") && LS.get("enable_hd") == "true") {
		optionalQuality = [
			{ aspectRatio: 1.7777777778 },
			{ minWidth: 1280 },
			{ minHeight: 720 }
		];

		$('#videoDeviceQuality').prop('checked', true);
	}

	if (selectedVideoDevice) {
		if (selectedVideoDevice == "off") {
			mediaOptions.video = false;
		} else {
			mediaOptions.video = {
				mandatory: {
					sourceId: selectedVideoDevice
				},
				optional: optionalQuality
			};
		}
		LS.set("device_video", selectedVideoDevice);
		$('#videoDeviceSelector option').removeAttr('selected');
		$('#videoDeviceSelector').val(selectedVideoDevice);
	} else {
		mediaOptions.video = true;
	}

	var nick = LS.get("nickname");

	if ((!Config.room || Config.room.length == 0) && roomInAddr && roomInAddr[1] && roomInAddr[1].length <= 40) {
		Config.room = roomInAddr[1];
	}

	if (!nick || nick.length == 0) {
		initFailed = true;
		showLoginWindow();
		return;
	} else {
		Config.nick = nick;
	}

	if (!Config.room) {
		initFailed = true;
		showLoginWindow();
		return;
	}

	webrtc = new SimpleWebRTC({
		localVideoEl: 'localVideo',
		remoteVideosEl: '',
		autoRequestMedia: true,
		debug: false,
		detectSpeakingEvents: true,
		autoAdjustMic: true,
		url: "https://speakup.cf/",
		nick: Config.nick,
		media: mediaOptions,
		socketio: {
			'force new connection': true
		}
	});

	checkCapabilities();

	$('#localNick').text(webrtc.config.nick);

	webrtc.on('readyToCall', function() {
		if (Config.room) {
			setRoom();
			webrtc.joinRoom(Config.room);
		}
	});

	webrtc.on('channelMessage', function(peer, label, data) {
		if (data.type == 'volume') {
			showVolume(document.getElementById('status_' + webrtc.getDomId(peer)), data.volume);
		}
	});

	webrtc.connection.on('message', function(data){
		Chat.parseMessage(data);
	});

	webrtc.on('videoAdded', function (video, peer) {
		videoCount++;
		var remotes = document.getElementById('remotes');
		if (remotes) {
			var d = document.createElement('div');
			d.className = 'videoContainer fade-in';
			d.id = 'container_' + webrtc.getDomId(peer);
			var v = document.createElement('div');
			v.className = 'statusPanel noselect';
			var peerId = webrtc.getDomId(peer);
			v.innerHTML = "<div id='status_" + peerId + "' class='statusVol'></div>";
			v.innerHTML+= "<div id='nick_" + peerId + "' class='statusNick'>" + (peer.nick || "Unknown") + "</div>";
			v.innerHTML+= "<div id='time_" + peerId + "' class='statusTime'>00:00</div>";
			// v.id = 'status_' + webrtc.getDomId(peer);
			video.volume = LS.get('remote_volume') || 1;
			d.onclick = function() {
				$(this).toggleClass('videoContainerSelected');
			}
			
			d.appendChild(v);
			d.appendChild(video);
			remotes.appendChild(d);
			playSound('user_join');
			msgIfEmpty();
		}
		
		
		setTimeout(function() {
			InfoPull.requestUpdate();
		}, 200);
	});

	webrtc.on('videoRemoved', function (video, peer) {
		removeVideo(webrtc.getDomId(peer));
	});

	webrtc.on('localScreenRemoved', function () {
		$('#tlb-screen').removeClass('active').addClass('inactive');
		alert("Screen sharing is now disabled", 'info');
	});

	webrtc.on('volumeChange', function (volume, treshold) {
		showVolume(document.getElementById('localStatus'), volume);
	});
	
	webrtc.on('mute', function (data) {
		webrtc.getPeers(data.id).forEach(function (peer) {
			$('#container_' + webrtc.getDomId(peer)).addClass('muted');
		});
	});
	
	webrtc.on('unmute', function (data) {
		webrtc.getPeers(data.id).forEach(function (peer) {
			$('#container_' + webrtc.getDomId(peer)).removeClass('muted');
		});
	});

	// local p2p/ice failure
	webrtc.on('iceFailed', function (peer) {
		alert("User " + peer.nick + " has been disconnected due to connection problems (ice_failed).", 'error');
		removeVideo(webrtc.getDomId(peer), true);
		console.log("ICE Failed on peer", peer);
	});

	// remote p2p/ice failure
	webrtc.on('connectivityError', function (peer) {
		alert("User " + peer.nick + " has been disconnected due to connection problems (connectivity_error).", 'error');
		removeVideo(webrtc.getDomId(peer), true);
		console.log("Remote fail", peer);
	});

	// log every callback
	webrtc.on('*', function (evtType, evtData) {
		var loggable = ['localMediaError'];
		var showPreferences = ['DevicesNotFoundError', 'SourceUnavailableError'];
		if (loggable.indexOf(evtType) >= 0) {
			if (showPreferences.indexOf(evtData.name) >= 0) {
				$('.modal').slideUp('fast');
				// $('#modal-back').fadeIn('fast');
				LS.del("device_audio");
				LS.del("device_video");
				settingsNeedReload = true;
				$('#preferencesWindow').slideDown('fast');
			} else {
				console.log('event', evtType, evtData);
				if (evtType === 'localMediaError' && evtData.name === 'PermissionDeniedError') {
					messageBanner.fatal("Please, allow microphone and webcam usage to continue");
				} else {
					messageBanner.show("SimpleWebRTC Reported error: " + evtType);
				}
			}

			$('body').removeClass('active').addClass('loading');
			$('#loader .spinner').hide();
			clearTimeout(initFailedTimer);
		}
	});

	if (parseFloat(LS.get('dj_mode_vol')) > 0) {
		$('#globalAudio').get(0).volume = parseFloat(LS.get('dj_mode_vol'));
	}
	
	setInterval(function() {
		updateCurrentTime();
		updateTimers();
	}, 1000);

	EventLogger.log('callready');
}

function enableScreamers(enable) {
	if (initFailed) return;
	var enable = enable || false;
	if (enable) {
		LS.set('easter', 1);
		alert("Screamers are now available", 'info');
	}

	if (LS.get('easter') == 1) {
		$('#chat-sc').removeClass('hidden');
	}
}

function setRoom(onlyLocation) {
	var onlyLocation = onlyLocation || false;

	var newUrl = location.origin + '/c/' + Config.room;
	if (location.href != newUrl) {
		history.replaceState({foo: 'bar'}, null, newUrl);
	}

	document.title = "SpeakUP: " + Config.room;

	if (onlyLocation) return;

	$('#createRoom').remove();
	$('#overlay').data('tooltip', "SpeakUP v" + Config.version + "<br/>&copy; LinkSoft.cf");
	initTooltips('#overlay');
	$('#tlb-share').unbind('click').click(function() {
		$('.modal').slideUp('fast');
		$('#modal-back').fadeIn('fast');
		$('#shareWindow').slideDown('fast', function() {
			$('#shareRoomLink').val(location.origin + '/c/' + Config.room);
			$('#shareRoomLink').select().focus();
		});
	});

	EventLogger.log('joinroom');

	$('body').removeClass('loading').addClass('fade-in active');
	clearTimeout(initFailedTimer);
	
	msgIfEmpty();
}

function initVideoPermissions(callback, requestVideo) {
	console.log("Permission Check Start");
	if (initFailed) return;
	var requestVideo = requestVideo || false;
	
	var gUM = navigator.getUserMedia ||
                        navigator.webkitGetUserMedia ||
                        navigator.mozGetUserMedia;

	gUM({ audio: true, video: requestVideo },
		function(stream) {
			stream.active = false;
		
			stream.getTracks().forEach(function(track){
				track.stop();
				track.enabled = false;
			});
			
			stream.getTracks().forEach(function(track){
				stream.removeTrack(track);
			});
			
			if (callback) {
				callback();
			}
		},
		function(err) {
			var errMessage = "";
			var showSettings = false;
			console.log(err);
			switch (err.name) {
				case "PermissionDismissedError": errMessage = "You've dismissed the request to share camera and microphone, reload page and allow usage."; break;
				case "SecurityError": // firefox - denied or dismissed
				case "PermissionDeniedError": errMessage = "You've denied the request to share camera and microphone. Please, allow usage and reload page."; break; // chrome - denied
				case "SourceUnavailableError": messageBanner.show("Your camera is already in use by other application"); initVideoPermissions(function() { callback(); }, false); return; break;
				default: errMessage = "Unknown error occurred while requesting permission for camera and microphone."; console.log(err);
			}
			
			messageBanner.fatal(errMessage, showSettings);
			
			if (callback) {
				callback();
			}
		}
	);
}

function oldBrowser() {
	initFailed = true;
	messageBanner.show("Your browser is unable to initialize WebRTC, please update or use another browser");
	$('body').removeClass('active').addClass('loading');
	$('#loader .spinner').hide();
	EventLogger.log('oldbrowser');
}

function checkCapabilities() {
	if (!webrtc.capabilities.supportGetUserMedia) {
		oldBrowser();
		return;
	}
	
	if (typeof window.speakupClient != 'undefined') {
		// old C# client
		oldBrowser();
		return;
	}

	if (sessionStorage.getItem('speakup_screen_share') != 'true') {
		if (!webrtc.capabilities.supportScreenSharing) {
			$('#tlb-screen').unbind('click');
			$('#tlb-screen').hide();
		} else if (typeof chrome != 'undefined' && !!(chrome && chrome.webstore && chrome.webstore.install)) {
			$('#tlb-screen').unbind('click').on('click', function() {
				chrome.webstore.install('', function() {
					// success callback
					location.reload();
				}, function() {
					alert("Can't start screen sharing without extension", "error");
				});
			});
		} else if (snMode) {
			// that's ok, it's an electron launcher
		} else {
			// oh, that's a firefox
			$('#tlb-screen').unbind('click');
			$('#tlb-screen').hide();
		}
	}

	enumerateDevices();
}

function setUnreadMessages(count) {
	if (Chat.visible) {
		unreadMessages = 0;
		$('#tlb-chat-unread').html('').hide();
	} else {
		unreadMessages = count;
		if (count > 0) {
			$('#tlb-chat-unread').html(count).show();
		} else {
			$('#tlb-chat-unread').html('').hide();
		}
	}
}

function sendScreamer(scId) {
	var scId = scId || Math.floor(Math.random() * 3) + 1;
	var dPayload = {id: scId};
	webrtc.sendToAll("screamer", dPayload);
	var data = {
		type: 'screamer',
		payload: dPayload
	}

	EventLogger.log('screamer');

	Chat.parseMessage(data, true);

	$('#chat-sc')
		.attr('disabled', 'disabled')
		.removeClass('active')
		.addClass('inactive');

	setTimeout(function() {
		$('#chat-sc')
			.removeAttr('disabled')
			.removeClass('inactive')
			.addClass('active');

	}, 30000);
}

function updateRemoteVolume(vol) {
	var vol = vol;
	LS.set('remote_volume', vol);
	$('#remotes video').each(function() {
		$(this).get(0).volume = vol;
	});
}

function initVolumeControl() {
	var volCurrent = LS.get('remote_volume') || 1;
	$('#sliderVolume').attr('value', volCurrent);
}

function initButtons() {
	if (initFailed) return;

	$('#chat-go').unbind('click').click(function(e) {
		e.preventDefault();
		Chat.submitMsg();
	});

	$('#compose-input').unbind('keypress').on('keypress', function(e) {
		if (e.keyCode == 13) { // enter
			e.preventDefault();
			Chat.submitMsg();
		}
	});

	$('#chat-sc').unbind('click').click(function(e) {
		e.preventDefault();
		var a = confirm("Do you really want to send screamer?");
		if (!a) return false;

		sendScreamer();
	});

	$('#chat-yt').unbind('click').click(function(e) {
		e.preventDefault();

		var plink = prompt("Enter link to YouTube video:", "");

		if (plink != "" && plink != null) {
			var dPayload = {nick: webrtc.config.nick, link: plink};
			webrtc.sendToAll("youtube", dPayload);
			var data = {
				type: 'youtube',
				payload: dPayload
			}
			Chat.parseMessage(data, true);
			Chat.showWindow();
		}
	});

	$('#chat-toggle,#tlb-chat').unbind('click').click(function() {
		if (Chat.visible) {
			Chat.hideWindow();
		} else {
			Chat.showWindow();
		}
	});

	$('#tlb-pause').unbind('click').on('click', function() {
		if (!muteActive) {
			muteActive = true;
			webrtc.pauseVideo();
			webrtc.mute();
			$(this).removeClass('inactive').addClass('active');
		} else {
			muteActive = false;
			webrtc.resumeVideo();
			webrtc.unmute();
			$(this).removeClass('active').addClass('inactive');
		}
	});

	$('#tlb-full').unbind('click').on('click', function() {
		if (screenfull.enabled) {
			if (screenfull.isFullscreen) {
				screenfull.exit();
				$(this).removeClass('active').addClass('inactive');
			} else {
				screenfull.request();
				$(this).removeClass('inactive').addClass('active');
			}
		}
	});

	$('#prefsCancel').unbind('click').on('click', function(e) {
		e.preventDefault();
		$('#modal-back').fadeOut('fast');
		$('#preferencesWindow').slideUp('fast');
	});

	$('#shareClose').unbind('click').click(function(e) {
		e.preventDefault();
		$('#modal-back').fadeOut('fast');
		$('#shareWindow').slideUp('fast');
	});

	$('#preferencesForm').unbind('submit').on('submit', function(e) {
		e.preventDefault();
		LS.set("device_audio", $('#audioDeviceSelector').val());
		LS.set("device_video", $('#videoDeviceSelector').val());
		LS.set("enable_hd", $('#videoDeviceQuality').prop('checked'));
		// updateRemoteVolume($('#volumeSelector').val());
		updateRemoteVolume($('#sliderVolume').val());
		$('#preferencesWindow').fadeOut('fast');
		if (settingsNeedReload || $('body').hasClass('loading')) {
			alert("Applying settings...", "info");
			setTimeout(function() {
				location.reload();
			}, 300);
		} else {
			$('#modal-back').fadeOut('fast');
		}
	});

	$('#tlb-pref,#fatalErrorSettings').unbind('click').click(function(e) {
		e.preventDefault();
		$('.modal').slideUp('fast');
		$('#modal-back').fadeIn('fast');
		$('#preferencesWindow').slideDown('fast');
	});

	$('#toolbar button').unbind('focus').on('focus', function() {
		$('#compose-input').focus();
	});

	$('#ownVideo,#remotes,#toolbar,#screamer,#overlay')
		.unbind('contextmenu')
		.bind('contextmenu', function(e) {
			e.preventDefault();
		});

	$('#modal-back').unbind('click').on('click', function() {
		$('#modal-back').fadeOut('fast');
		$('.modal').slideUp('fast');
	});

	$('#msgUseClient>a').unbind('click').on('click', function() {
		location.href = "speakup://" + $('#loginRoom').val();
	});
	
	$('#fatalErrorRetry').unbind('click').on('click', function() {
		location.reload();
	});

	if (snMode) {
		$('#msgUseClient').hide();
	}

	$('#tlb-screen').unbind('click').on('click', function() {
		if (!snMode && webrtc.getLocalScreen()) {
			webrtc.stopScreenShare();
			alert("Screen sharing is now disabled", 'info');
			$('#tlb-screen').removeClass('active').addClass('inactive');
		} else if (snMode && webrtc.getLocalScreen()) {
			webrtc.stopScreenShare();
			if (webrtc.webrtc.localScreen && webrtc.webrtc.localScreen.getTracks().length > 0) {
				for (var i = 0; i < webrtc.webrtc.localScreen.getTracks().length; i++) {
					webrtc.webrtc.localScreen.getTracks()[i].stop();
				}
			}
			alert("Screen sharing is now disabled", 'info');
			$('#tlb-screen').removeClass('active').addClass('inactive');
		} else {
			webrtc.shareScreen(function (err) {
				if (err) {
					alert("Screen sharing init failed!", 'error');
					$('#tlb-screen').removeClass('active').addClass('inactive');
				} else {
					alert("Screen sharing is now enabled", 'info');
					$('#tlb-screen').removeClass('inactive').addClass('active');
				}
			});

		}
	});

	$('#videoDeviceSelector,#audioDeviceSelector,#videoDeviceQuality').on('change', function() {
		settingsNeedReload = true;
	});
	
	$('#ownVideo').unbind('click').on('click', function() {
		$(this).toggleClass('videoContainerSelected');
	});
}

function initTooltips(selector) {
	if (initFailed) return;
	var selector = selector || '[data-tooltip]';
	$(selector).each(function() {
		var tip = new Tooltip (
			$(this).data('tooltip'), {
				auto: 1,
				spacing: 15,
				effectClass: 'slide',
				inClass: 'in'
			}
		);

		$(this).unbind('mouseenter').on('mouseenter', function() {
			tip.show($(this).get(0));
		});

		$(this).unbind('mousedown mouseleave').on('mousedown mouseleave', function() {
			tip.hide();
		});
	});
}

function injectElements() {
	if ($('#modal-back').length == 0) {
		$('body').append("<div id='modal-back'></div>");
	}
	
	if ($('#alert-container').length == 0) {
		$('body').append("<div id='alert-container'></div>");
	}

	if ($('#overlay').length == 0) {
		$('body').append("<div id='overlay' class='noselect'></div>");
	}

	if ($('#screamer').length == 0) {
		$('body').append("<img id='screamer' alt='Screamer' src='data:image/gif;base64,R0lGODlhAQABAPAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='/>");
	}
	
	if ($('#rainbow').length == 0) {
		$('body').append("<div id='rainbow'></div>");
	}

	if ($('#globalAudio').length == 0) {
		$('body').append("<audio id='globalAudio'></audio>");
	}

	Config.staticPath = $('body').data('static');
	Config.version = $('body').data('version');

	if (snMode) {
		window.speakupClient = {
			disableCallMode: function(){
				node.ipcRenderer.send('call-mode-change', 'disable');
			},

			enableCallMode: function(){
				node.ipcRenderer.send('call-mode-change', 'enable');
			}
		}

		if (!window.chrome) {
			window.chrome = {};
		}

		window.chrome = {
			webstore: false
		}
	}
}

function cacheResources() {
	var audioFiles = ['user_join', 'user_leave', 'message', 'error', 'scream1', 'scream2', 'rainbow'];
	for (var i = 0; i < audioFiles.length; i++) {
		var snd = new Audio(Config.staticPath + "/apps/speakup/sounds/" + audioFiles[i] + ".ogg");
	}

	var imageFiles = ['screamer1', 'screamer2'];
	for (var i = 0; i < imageFiles.length; i++) {
		var img = new Image();
		img.src = Config.staticPath + '/apps/speakup/images/' + imageFiles[i] + '.jpg';
	}
}

var InfoPull = {
	requestUpdate: function() {
		if (Config.room && !initFailed) {
			webrtc.connection.emit("updateData");
		}

		this.delayUpdate();
	},

	parseUpdate: function(data) {
		console.log(data);
	},

	delayUpdate: function() {
		var owner = this;
		setTimeout(function() {
			owner.requestUpdate();
		}, 30000);
	}
}

function systemInit() {
	injectElements();
	initButtons();
	initTooltips();
		
	initFailed = false;
	initFailedTimer = setTimeout(function() {
		messageBanner.hide();
		messageBanner.fatal("Initialization failed due to timeout.<br/>Please, check if you've allowed usage of your microphone and web camera. Also, server may be down.");
	}, 7000);
	
	enumerateDevices(function() {
		initVolumeControl();
		enableScreamers();
		cacheResources();
		initVideoPermissions(function() {
			prepareCall();
		}, true);
	});
}

$(document).ready(function() {
	setTimeout(function() {
		systemInit();
	}, 400);
});

$(window).on('beforeunload', function() {
	if (settingsNeedReload) {
		
	} else {
		if (callModeEnabled) {
			return "You are currently in conference.\nDo you really want to close SpeakUP?";
		}
	}
});

$(window).on('resize', function() {
	Chat.scrollLog();
});