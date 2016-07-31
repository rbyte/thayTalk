<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>Thich Nhat Hanh: Mindfulness as a Foundation for Health</title>
	<link rel="stylesheet" type="text/css" href="main.css"/>
	<link rel="icon" type="image/png" href="assets/Enso.svg.png">
	<!--<script src="assets/d3.js" async></script>-->
	<!-- deferred scripts are guarenteed to execute in the order that they appear in the document -->
	<script src="main.js" defer></script>
	<script src="errorHandling.js" defer></script>
</head>

<body>
	<header><span>Thich Nhat Hanh: Mindfulness as a Foundation for Health</span><span id="about">About</span></header>
	<div id="tableOfContents" class="dragStyle" title="Transcript overview.
Blocks: paragraphs.
Indented: enumeration.
Blue: questions.
Red: current position.
Yellow: viewport.
Use as a scrollbar.">
		<div id="currentPosInScrollbar"></div>
		<div id="scrollBarHandle"></div>
	</div>
	<div id="resizer" title="Drag to adjust transcript-video proportion."></div>
	
	<div id="videoBox">
		<video id="video" controls="" preload="auto">
			<!-- sources are loaded from JS -->
			<track kind="captions" label="English Transcription" src="generated/subtitle_0.vtt" srclang="en">
		</video>
		<ul id="selectSourceIcon">
			<img src="assets/gear.svg">
			<ul id="selectSourceDropdown"></ul>
		</ul>
	</div>
	
<div id="aboutBox">
	This website presents Thich Nhat Hanh's <a href="https://www.youtube.com/watch?v=Ijnt-eXukwk#t=58m14s">talk at Google</a> in 2011. It aims to increase its accessibility by providing a structured, synchronised transcript.
	<p>– Matthias Graf, <a href="mailto:matthias.graf&#064;mgrf.de">matthias.graf@mgrf.de</a>, July 2016</p>
	
	<h3>Transcription</h3>
	This is <b>my interpretation</b> of the talk. It is not faithful to the word! I tried instead to find a sensible transcription.
	<ul>
		<li>Stuttering, verbal corrections, errors, and repetitions are reduced to their essence.</li>
		<li>Paragraphs and enumerations structure the talk based on topics and pauses.</li>
		<li>Highlighted in <b>bold</b> are central themes and keywords.</li>
		<li><i>Italics</i> indicate accentuation.</li>
		<li>Quotations and questions from the audience are marked in blue.</li>
		<li>Parentheses contain my annotations.</li>
		<li>British English is used, and serial commas.</li>
	</ul>
	
	<h3>Sources</h3>
	The talk presented here was cut from the <a href="https://www.youtube.com/watch?v=Ijnt-eXukwk">source</a>, starting from 58:14 to 3:11:17, and cropped to 1:1 aspect ratio:
	<ul id="downloadsList">
		<li>Subtitles: <a href="generated/subtitle_0.srt" download>SubRip</a>, <a href="generated/subtitle_0.vtt" download>WebVTT</a></li>
		<li>Subtitles for the uncut source: <a href="generated/subtitle_3494.srt" download>SubRip</a>, <a href="generated/subtitle_3494.vtt" download>WebVTT</a></li>
		<li>Transcript: <a href="generated/transcriptFlat.xml" download>xml</a>, <a onclick="openTranscriptAsPlainText()">txt</a></li>
	</ul>
	I release the transcript and subtitles as part of the <a href="https://creativecommons.org/licenses/by-sa/3.0/">creative commons</a>, and the <a href="https://github.com/rbyte/thayTalk">source code</a> as free software.
	<p>I am happy to receive your criticism and suggestions.</p>
	
	<h3>Acknowledgements</h3>
	This project was inspired by Robert Ochshorn's <a href="https://github.com/lowerquality/gentle">Gentle</a>, a forced-aligner built on <a href="https://github.com/kaldi-asr/kaldi">Kaldi</a>.
	<p>Fonts used are <a href="https://github.com/CatharsisFonts/Cormorant">Cormorant Garamond</a> & <a href="http://www.georgduffner.at/ebgaramond/">EB Garamond</a>.</p>
	<p>I would also like to thank the <a href="http://plumvillage.org/">monastic community</a> and Google for preparing and releasing this great talk.</p>
</div>
	
	<div id="errorMessage">Your browser is incapable of loading this page correctly. Try the latest Firefox (>=47) or Chrome (>=51) instead.</div>
	<noscript>Your browser is incapable of loading this page correctly, because scripts are disabled.</noscript>
	
	<?php include 'generated/transcriptFlat.xml'; ?>
</body>
</html>
