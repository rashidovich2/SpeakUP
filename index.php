<?
error_reporting(0);
require('../../html/scripts/engine/config.php');
require('../../html/scripts/engine/functions.php');

class CodeGen {
	public $stylesheet = '';
	public $javascript = '';
	public $iconsTouch = '';
	public $iconsFav = '';

	private $sizes;
	private $files;
	private $staticPath;

	private function listIcons($rel, $path, $prefix, $sizesArray) {
		$str = "\n";
		foreach ($sizesArray as $size) {
			$str .= "\t\t<link rel='{$rel}' sizes='{$size}x{$size}' href='{$path}/{$prefix}-{$size}x{$size}.png'>\n";
		}
		return $str;
	}

	private function fillUp() {
		$this->stylesheet = "\n";
		$this->javascript = "\n";

		foreach ($this->files as $file){
			$fileType = $file[0];
			$filePath = 'resources/' . $file[1];
			$fileName = $this->staticPath . '/apps/speakup/' . $file[1];
			$fileVer = filemtime($filePath);
			if ($fileType == 'css'){
				$this->stylesheet .= "\t\t<link rel='stylesheet' href='{$fileName}?_v={$fileVer}' />\n";
			} else if ($file[0] == 'js'){
				$this->javascript .= "\t\t<script src='{$fileName}?_v={$fileVer}'></script>\n";
			}
		}
	}

	public function __construct($static, $files) {
		$this->sizes = new stdClass();
		$this->sizes->touch = array(180, 152, 144, 120, 114, 76, 72, 60, 57, 48);
		$this->sizes->fav = array(16, 32, 48, 64, 96, 128);

		$this->files = $files;
		$this->staticPath = $static;

		$this->fillUp();
		$this->iconsTouch = $this->listIcons('apple-touch-icon', $this->staticPath . '/apps/speakup/images/icons', 'apple-touch-icon', $this->sizes->touch);
		$this->iconsFav = $this->listIcons('icon', $this->staticPath . '/apps/speakup/images/icons', 'favicon', $this->sizes->icon);
	}
}

$ver = "1.8.4";

if (defined("DEBUG") || isset($_REQUEST['debug'])) {
	$files = array(
		array('css', 'styles/app.css'),
		array('js',  'scripts/swrtc-latest-v2.min.js'),
		array('js',  'scripts/tooltip.min.js'), // http://darsa.in/tooltip/
		array('js',  'scripts/screenfull.min.js'), // https://github.com/sindresorhus/screenfull.js
		array('js',  'scripts/app.js')
	);
} else {
	$files = array(
		array('css', 'styles/app.css'),
		array('js',  'scripts/compiled.js')
	);
}

$code = new CodeGen($static, $files);

trackStat("SpeakUP", $ver, "start");

?><!DOCTYPE html>
<html>
	<head>
		<title>SpeakUP</title>
		<meta charset='utf-8' />
		<link rel='shortcut icon' href='<?=$static?>/apps/speakup/images/icons/favicon.png' />
		<link rel='stylesheet' href='https://fonts.googleapis.com/css?family=Scada&amp;subset=latin,cyrillic' />
		<meta name='viewport' content='width=device-width, user-scalable=no, initial-scale=1' />

		<meta name='title' value='SpeakUP!' />
		<meta name='description' value='Instant videoconferences for up to 4 people' />
		<link rel='image_src' href='<?=$static?>/apps/speakup/images/screenshot.png' />
		<link rel='chrome-webstore-item' href='https://chrome.google.com/webstore/detail/mkjefhhjabmifmakbfmjgjbhhpiloamp' />
		<meta name='theme-color' content='#113355'>

		<meta property='og:title' content='SpeakUP!'/>
		<meta property='og:type' content='website'/>
		<meta property='og:image' content='<?=$static?>/apps/speakup/images/screenshot.png'/>
		<meta property='og:description' content='Instant videoconferences for up to 4 people'/>

		<?=$code->iconsTouch?>
		<?=$code->iconsFav?>

		<?=$code->stylesheet?>
	</head>
	<body class='loading' data-version="<?=$ver?>" data-static="<?=$static?>">
		<!-- LOADING AND LOGIN SCREEN -->
		<div id='loader' class='noselect'>
			<div class='logo'></div>
			<div class='spinner'>
				<div class='bounce1'></div>
				<div class='bounce2'></div>
				<div class='bounce3'></div>
			</div>
			<div id='loginWindow' class='modal'>
				<h3>Login information</h3>
				<form id='loginForm'>
					<div class='row'>
						<div><label for='loginNick'>Nickname </label></div>
						<div><input type='text' id='loginNick' placeholder='Nickname' required pattern='([a-zA-Z0-9\-_]{1,})'/></div>
					</div>
					<div class='row'>
						<div><label for='loginRoom'>Room ID </label></div>
						<div><input type='text' id='loginRoom' placeholder='Room ID' required pattern='([a-zA-Z0-9\-_]{1,})'/></div>
					</div>
					<div class='row'>
						<div>
							<button id='loginSubmit' class='btn'>Let's Speak!</button>
						</div>
					</div>
				</form>
				<div id='msgUseClient'>
					<a href='javascript:'>Join via SpeakUP Client</a>
				</div>
			</div>
			<div id='fatalError' class='modal'>
				<h3>Fatal error</h3>
				<div id='fatalErrorText'></div>
				<button class='btn' id='fatalErrorSettings'>Settings</button>
				<button class='btn' id='fatalErrorRetry'>Try again</button>
			</div>
		</div>
		<!-- end: LOADING AND LOGIN SCREEN -->

		<!-- MODAL WINDOWS -->
		<div id='preferencesWindow' class='modal'>
			<h3>Preferences</h3>
			<div class='modal-inner'>
				<div class='modal-tabs'>
					<div class='modal-tab' data-target='#prefFrmMedia'>Multimedia</div>
					<div class='modal-tab' data-target='#prefFrmApp'>Application</div>
					<div class='modal-tab' data-target='#prefFrmShare'>Share</div>
					<div class='modal-tab' data-target='#prefFrmAbout'>About</div>
				</div>
				<form id='prefFrmMedia' class='modal-tab-content'>
					<div class='row'>
						<div><label for='audioDeviceSelector'>Microphone </label></div>
						<div><select id='audioDeviceSelector'></select></div>
					</div>
					<div class='row'>
						<div><label for='sliderVolume'>Playback Volume </label></div>
						<div><input type='range' min='0' max='1' step='0.05' id='sliderVolume' class='trackbar' /></div>
					</div>
					<div class='row'>
						<div><label for='videoDeviceSelector'>Camera </label></div>
						<div><select id='videoDeviceSelector'></select></div>
					</div>
					<div class='row'>
						<div><label><input type='checkbox' id='videoDeviceQuality'/>Prefer HD video</label></div>
					</div>
				</form>
				
				<form id='prefFrmApp' class='modal-tab-content'>
					<div class='row'>
						<div><label for='inputPrefsNickname'>Your Nickname </label></div>
						<div><input type='text' id='inputPrefsNickname' /></div>
					</div>
					<div class='row'>
						<div><label><input type='checkbox' id='confirmClose'/>Show confirmation on closing</label></div>
					</div>
				</form>
				
				<form id='prefFrmShare' class='modal-tab-content'>
					<div class='row'>
						<div><label for='shareRoomLink'>Room Link</label></div>
						<div><input type='text' id='shareRoomLink' value='' readonly /></div>
					</div>
				</form>
				
				<form id='prefFrmAbout' class='modal-tab-content'>
					<p id='prefsAboutTitle'>SpeakUP</p>
					<p>Created by <a href='https://linksoft.cf/' target='_blank'>LinkShift</a>.</p>
					<p>View project on <a href='https://github.com/linkshift/SpeakUP' target='_blank'>GitHub</a>.</p>
				</form>
			</div>
			
			<div class='row'>
				<div><button id='prefsCancel' class='btn'><i class="icon icon-cancel"></i> Cancel</button></div>
				<div><button id='prefsSave' class='btn'><i class="icon icon-ok"></i> Save</button></div>
			</div>
		</div>
		<!-- end: MODAL WINDOWS -->

		<!-- VIDEOS -->
		<div id='message' class='noselect'></div>

		<div class='videoContainer' id='ownVideo'>
			<div class='statusPanel noselect'>
				<div id='localStatus' class='statusVol'></div>
				<div id='localNick' class='statusNick'></div>
				<div id='localTime' class='statusTime'>00:00</div>
			</div>
			<video id='localVideo'></video>
		</div>
		<div id='remotes'></div>
		<!-- end: VIDEOS -->

		<!-- CHAT -->
		<div id='chat'>
			<div id='chat-toggle' class='noselect' data-tooltip='Close Chat Panel'>X</div>
			<h3>Chat</h3>
			<div id='chatlog'>
			</div>
			<div id='compose'>
				<input type='text' id='compose-input'/>
				<div class='btn-group'>
					<button class='btn' id='chat-yt' data-tooltip='Send YouTube video'>YouTube</button>
					<button class='btn hidden' id='chat-sc' data-tooltip='Send screamer'>Screamer</button>
					<button class='btn' id='chat-go' data-tooltip='Send message'>
						<i class="icon icon-paper-plane icon-fw"></i>
					</button>
				</div>
			</div>
		</div>
		<!-- end: CHAT -->

		<!-- TOOLBAR -->
		<div id='toolbar' class='btn-group'>
			<button id='tlb-pause' data-tooltip='Pause Your Audio/Video' class='inactive'>
				<i class='icon icon-pause icon-fw icon-xl'></i>
			</button>

			<button id='tlb-screen' data-tooltip='Toggle Screen Share' class='inactive'>
				<i class='icon icon-screen icon-fw icon-xl'></i>
			</button>

			<button id='tlb-share' data-tooltip='Share Room Link' class='active'>
				<i class='icon icon-share icon-fw icon-xl'></i>
			</button>

			<button id='tlb-pref' data-tooltip='Preferences' class='active'>
				<i class="icon icon-cog icon-fw icon-xl"></i>
			</button>

			<button id='tlb-full' data-tooltip='Fullscreen' class='inactive'>
				<i class='icon icon-resize-full icon-fw icon-xl'></i>
			</button>

			<button id='tlb-chat' data-tooltip='Toggle Chat' class='inactive'>
				<i class='icon icon-chat icon-fw icon-xl'></i>
				<span id='tlb-chat-unread' class='tlb-text'></span>
			</button>
		</div>
		<!-- end: TOOLBAR -->

		<!-- Fixes for NodeJS - Electron Integration -->
		<script>
			if (typeof require !== 'undefined') {
				window.node = {};
				window.node.require = require;
				window.node.ipcRenderer = require('electron').ipcRenderer;

				delete window.require;
				delete window.exports;
				delete window.module;
			}
		</script>
		<!-- end: Fixes for NodeJS - Electron Integration -->

		<!-- Google Analytics -->
		<script>
			(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
			(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
			m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
			})(window,document,'script','//www.google-analytics.com/analytics.js','ga');

			ga('create', 'UA-9210291-4', 'auto');
			ga('send', 'pageview');
		</script>
		<!-- end: Google Analytics -->

		<!-- JS LIBS -->
		<script src='https://ajax.googleapis.com/ajax/libs/jquery/2.2.2/jquery.min.js'></script>
		<?=$code->javascript?>
		<!-- end: JS LIBS -->
	</body>
</html>
