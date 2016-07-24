/*
	Matthias Graf
	matthias.graf@mgrf.de
	2016
	GNU AGPL v3
*/


const zoomFactor = 1.10 // macs tend to have finer grain mouse wheel ticks
const defaultDurationOfChartWindowInSeconds = 25
const graphSampleRate = 15 // Hertz: Dots per Second
const amplitudeFactor = 3.5
const xPrecision = 6
const yPrecision = 4
// automatic grouping
// Subtitles: As a rule of thumb: 35-40 Latin characters per line.
// The number of lines in any subtitle must be limited to two.
const preferedCharCount = 40
const preferedCharCountMax = 60
var inputIsAlreadyFlat = true
const loadAmplitudeChart = false
// may be VERY memory intense
const computeAmplitudeChartOn = false
const svgHeight = 3 // defaultDurationOfChartWindowInSeconds * realSVGaspectRatio
// the chart X axis is a 1:1 mapping between pixels and seconds
// will be reset later depending on total length of track (to avoid stroke distortion that is due to viewport zooming)

var transcript = document.getElementById("transcript")
var videoBox = document.getElementById("videoBox")
var video = document.getElementById("video")
var selectSourceDropdown = document.getElementById("selectSourceDropdown")
var tableOfContents = document.getElementById("tableOfContents")
var scrollBarHandle = document.getElementById("scrollBarHandle")
var currentPosInScrollbar = document.getElementById("currentPosInScrollbar")
var resizer = document.getElementById("resizer")
var aboutBox = document.getElementById("aboutBox")
var about = document.getElementById("about")
var downloadsList = document.getElementById("downloadsList")

var aboutBoxWidth = 0.4
var aboutBoxRight = 0
var transcriptWidth = 0.55

var currentWord, selectedWord, hoveredWord
var alignedGroup = []
var notificationAudioSuccess = new Audio("assets/KDE-K3B-Insert-Medium.ogg")
var notificationAudioError = new Audio("assets/KDE-Sys-App-Error.ogg")
var notificationAudioError2 = new Audio("assets/glass.ogg")

var svg, domSvg, amplitudePath, positionLine, svgPageRect, wordAreaSvgGroup
var lastMousedownEvent
var draggedNode = false
var dragInProgress = false

var scrollTransition = {
	duration: 1000,
	padding: 0.2,
	lastManualScroll: 0,
}
var windowResize = {dirty: false, last: 0}

var aboutBoxTransition = {
	duration: 1000,
}

var svgWidth = 300
var viewBox = {
	x: 0, y: 0, w: defaultDurationOfChartWindowInSeconds, h: svgHeight,
	toString: function () {
		return this.x + " " + this.y + " " + this.w + " " + this.h
	},
	update: function () {
		svg.attr("viewBox", viewBox)
	},
	transition: function (duration = 300) {
		svg.transition()
			.duration(duration)
			.attr("viewBox", viewBox)
	},
	autoPan: function () {
		if (video.currentTime < viewBox.x || viewBox.x + viewBox.w < video.currentTime) {
			viewBox.x = video.currentTime - 0.2 * viewBox.w
			viewBox.transition()
		}
	}
}

function XHR(url, callback) {
	var xhr = new XMLHttpRequest()
	xhr.open("GET", url)
	xhr.onload = function (e) {
		if (xhr.readyState === 4) {
			callback(xhr)
		}
	}
	xhr.send()
}

function getJson(url, callback) {
	XHR(url, function (xhr) {
		console.assert(xhr.status === 200)
		callback(JSON.parse(xhr.responseText))
	})
}

function defineSVGdefs() {
	var svgDefs = svg.append("defs")
	
	var gradient = svgDefs.append("linearGradient")
		.attr("id", "gradient")
		.attr("x1", "0%")
		.attr("y1", "100%")
		.attr("x2", "0%")
		.attr("y2", "0%")
	
	gradient.append("stop")
		.attr("offset", "0%")
		.attr("stop-color", "#000")
		.attr("stop-opacity", 0)
	
	gradient.append("stop")
		.attr("offset", "100%")
		.attr("stop-color", "#000")
		.attr("stop-opacity", 1)
	
	var wordGradient = svgDefs.append("linearGradient")
		.attr("id", "wordGradient")
		.attr("x1", "0%")
		.attr("y1", "0%")
		.attr("x2", "100%")
		.attr("y2", "0%")
	
	wordGradient.append("stop")
		.attr("offset", "0%")
		.attr("stop-color", "#f5d937")
		.attr("stop-opacity", 0.6)
	
	wordGradient.append("stop")
		.attr("offset", "100%")
		.attr("stop-color", "#a39025")
		.attr("stop-opacity", 0.3)
	
}

function setPositionLineTo(x) {
	positionLine.attr("d", "M" + x + ",0 L" + x + "," + svgHeight)
}

function getNeighbourBounds(word = selectedWord) {
	var prev = stepWordUp(word)
	var succ = stepWordDown(word)
	var prevEnd = 0
	var succStart = video.duration
	if (prev)
		var {end: prevEnd} = getStartAndEnd(prev)
	if (succ)
		var {start: succStart} = getStartAndEnd(succ)
	return [prevEnd, succStart]
}

function computeAmplitudeChart(callback) {
	var xhr = new XMLHttpRequest()
	// sample rate: in Hertz. gives the number of data points per second an audio signal is sampled (sensed)
	// 44,1kHz is adapted to the best human ability to hear short sounds
	// 44100 == audioBuffer.sampleRate == leftChannel.length/audioBuffer.duration
	
	// AudioBuffer { sampleRate: 44100, length: 1305600, duration: 29.60544217687075, numberOfChannels: 2 }
	xhr.open('GET', "media/Thich Nhat Hanh - Mindfulness as a Foundation for Health, LQ, Cut.webm", true)
	xhr.responseType = 'arraybuffer'
	xhr.onload = function () {
		onError = console.log
		console.log('start decodeAudioData')
		
		let audioContext = new AudioContext()
		audioContext.decodeAudioData(xhr.response, function (audioBuffer) {
			console.log(audioBuffer)
			drawAmplitudeChartFromAudioBuffer(audioBuffer)
			callback()
		}, onError)
	}
	xhr.send()
}

function drawAmplitudeChartFromPathCache(callback) {
	XHR("media/pathCache.txt", function (xhr) {
		amplitudePath.attr("d", xhr.responseText)
		console.log('done draw svg path from cache')
		callback()
	})
}

function drawAmplitudeChartFromAudioBuffer(audioBuffer) {
	// Float32Array describing left channel
	var leftChannel = audioBuffer.getChannelData(0)
	var numberOfDotsInGraph = graphSampleRate * audioBuffer.duration
	
	var bucketAmplitudeSum = 0
	var bucketDivider = 0
	// for chart normalisation
	var max = 0
	var buckets = []
	
	// each bucket is one dot in the resulting amplitude chart
	for (var i = 0, nextBucketStartIdx = 0, bucketNo = 0; i < leftChannel.length; i++) {
		// starts with 0
		nextBucketStartIdx = Math.floor(leftChannel.length / numberOfDotsInGraph * bucketNo)
		bucketAmplitudeSum += Math.abs(leftChannel[i])
		bucketDivider++
		if (i === nextBucketStartIdx) {
			var meanAmplitude = bucketAmplitudeSum / bucketDivider
			max = Math.max(max, meanAmplitude)
			buckets.push(meanAmplitude)
			bucketNo++
			bucketAmplitudeSum = 0
			bucketDivider = 0
		}
	}
	// defaultDurationOfChartWindowInSeconds
	var pathD = "M"
	buckets.map(function (meanAmplitude, i) {
		var x = i / graphSampleRate
		var y = svgHeight - meanAmplitude * svgHeight * (1 / max) * amplitudeFactor
		pathD += (i === 0 ? "" : "L") + x.toPrecision(xPrecision) + "," + y.toPrecision(yPrecision) + " "
	})
	
	// close path
	pathD += "L" + svgWidth + "," + svgHeight + " L0," + svgHeight
	amplitudePath.attr("d", pathD)
	
	console.log('done draw svg')
}

function isWord(node) {
	return node instanceof HTMLSpanElement
		&& node.getAttribute("start")
		&& node.getAttribute("end")
}

function getStartAndEnd(node = currentWord) {
	if (!node || !("getAttribute" in node)) // text nodes do not
		return {start: null, end: null}
	var start = node.getAttribute("start")
	var end = node.getAttribute("end")
	if (!start || !end)
		return {start: null, end: null}
	start = Number(start)
	end = Number(end)
	if (isNaN(start) || isNaN(end))
		return {start: null, end: null}
	return {start, end}
}

function resetCurrentWord(word = transcript.firstChild) {
	unsetAlignedGroup()
	unsetCurrentWord()
	currentWord = word
	findCurrentWord()
	transcriptScrollStart(true /*force*/)
}

var stepWordUp = word => stepWord(word, true)
var stepWordDown = word => stepWord(word, false)

function stepWord(word, up) {
	if (!word)
		return false
	var next = stepInTree(word, transcript, up)
	return isWord(next) ? next : stepWord(next, up)
}

// find the current word in the transcript FAST. making a tree-walk each update loop is too costly. just do an incremental search from a given element, assuming that the sought after element is close by
function stepInTree(e, root, up, ignoreChildren = false) {
	if (e.hasChildNodes() && !ignoreChildren) {
		return up ? e.lastChild : e.firstChild
	} else if (up ? e.previousSibling : e.nextSibling) {
		return up ? e.previousSibling : e.nextSibling
	} else if (!e.parentNode || e.parentNode === root) {
		return false
	} else {
		// we can not return the parentNode directly, because that would cause stepInTree to jump back and forth endlessly between a parent and its children
		// so while climbing back up the tree, we ignore children until we found a sibling
		return stepInTree(e.parentNode, root, up, true)
	}
}

function findCurrentWord() {
	if (!currentWord) {
		console.log("reached end of transcript")
		return false
	}
	
	if (isWord(currentWord) && video.currentTime < getStartAndEnd(currentWord).end) {
		return true
	}
	
	currentWord = stepWordDown(currentWord)
	// until found
	return findCurrentWord()
}

function setAlignedGroup() {
	// wrap text in span and replace
	alignedGroup = alignedGroup.map(node => {
		if (node.nodeType === Node.TEXT_NODE) {
			// if nextSibling is null, the span is inserted at the end
			var span = node.parentNode.insertBefore(document.createElement("span"), node.nextSibling)
			span.appendChild(node)
			return span
		}
		return node
	})
	
	alignedGroup.forEach(node => node.classList.add("alignedGroup"))
}

function unwrap(node) {
	while (node.hasChildNodes())
		node.parentNode.insertBefore(node.firstChild, node)
	node.parentNode.removeChild(node)
}

function unsetAlignedGroup() {
	alignedGroup.forEach(node => {
		node.classList.remove("alignedGroup")
		// node may have been manually removed already
		if (node.parentNode && !isWord(node)) { // unwrap!
			console.assert(node instanceof HTMLSpanElement)
			// node may have changed internally (if not, we would expect only 1 text child)
			unwrap(node)
		}
	})
	alignedGroup = []
}

function alignedGroupEnd() {
	// some nodes may be text wrappers with no end. search from end for last word
	var i = alignedGroup.length - 1
	while (i >= 0) {
		var end = getStartAndEnd(alignedGroup[i--]).end
		if (end)
			return end
	}
	console.assert(false)
}

// assumes currentWord is up to date
function highlightAlignedGroup() {
	if (isWord(currentWord)) {
		if (alignedGroup.length === 0 || alignedGroupEnd() <= video.currentTime) {
			unsetAlignedGroup()
			findAlignedGroup()
			setAlignedGroup()
		}
	}
}

function findAlignedGroup() {
	alignedGroup = []
	if (inputIsAlreadyFlat) {
		alignedGroup.push(currentWord)
		return
	}
	var blocks = [[]]
	
	function step(node) {
		var currentBlock = blocks[blocks.length - 1]
		if (!node
			|| node instanceof HTMLBRElement
			|| node instanceof HTMLLIElement
		) {
			return false
		}
		if (node.nodeType === Node.TEXT_NODE) {
			currentBlock.push(node)
			// third = 3. is not the ending of a sentence. exclude this case. \D === [^0-9]
			if (node.wholeText.match(/(\D\.|^\.|\?|!|:)/)) {
				// terminate here
				return false
			}
			if (node.wholeText.match(/(,| - |;)/)) {
				// is possible break point (between blocks of text)
				blocks.push([])
			}
		}
		if (isWord(node)) {
			currentBlock.push(node)
		}
		// <div id="transcript"><span>some text</span>more</div>
		// stepInTree, beginning with transcript.firstChild:
		//      "", <span>, "some text", "more"
		// hence, ignore children of words (<span>)!
		return step(stepInTree(node, transcript, /*down:*/ false, /*ignore children if:*/isWord(node)))
	}
	
	step(currentWord)
	
	// [[1,2],[3,1]] => [3,7]
	var charCountOfBlocksAccumulated = blocks.map(block =>
		block.map(node => node.textContent.length)
			.reduce((a, b) => a + b, 0)
	)
	charCountOfBlocksAccumulated.forEach((e, i) => i === 0 ? null
		: charCountOfBlocksAccumulated[i] += charCountOfBlocksAccumulated[i - 1])
	
	console.assert(charCountOfBlocksAccumulated.length > 0)
	var totalLength = charCountOfBlocksAccumulated[charCountOfBlocksAccumulated.length - 1]
	
	var cutAfter = [0, 0]
	charCountOfBlocksAccumulated.forEach((chars, i) =>
		Math.abs(preferedCharCount - cutAfter[1]) < Math.abs(preferedCharCount - chars) ? null
			: cutAfter = [i, chars])
	// ensures that no "orphans" - tiny groups - remain left behind
	if (totalLength > preferedCharCountMax)
	// those are the blocks we add to the group
		blocks = blocks.slice(0, cutAfter[0] + 1)
	
	if (blocks.length === 1 && blocks[0].length > 0 && charCountOfBlocksAccumulated[0] > preferedCharCountMax) {
		// even the first block is too large. subdivide block
		var block = blocks[0]
		var charCountAccumulated = block.map(node => node.textContent.length)
		// since we cut BEFORE the selected index, we need to start with 0. prepend 0:
		charCountAccumulated.unshift(0)
		charCountAccumulated.forEach((e, i) => i === 0 ? null
			: charCountAccumulated[i] += charCountAccumulated[i - 1])
		var totalBlockLength = charCountAccumulated[charCountAccumulated.length - 1]
		
		var {start: prevStart, end: prevEnd} = getStartAndEnd(currentWord)
		var skipFlag = false
		const uncutableHere = -1
		var gapBetweenBlocks = block.map(node => {
			if (node.nodeType === Node.TEXT_NODE) {
				var [start, end] = [prevEnd, prevEnd]
				// non-whitespace text has a length. do not split before or behind it
				if (node.wholeText.length > 1)
					skipFlag = true
				var gap = uncutableHere
			} else {
				var {start, end} = getStartAndEnd(node)
				var gap = skipFlag ? uncutableHere : start - prevEnd
				skipFlag = false
			}
			prevStart = start
			prevEnd = end
			return gap
		})
		
		// we can cut at gaps >=0, but there may be none
		var cuttableIndices = []
		gapBetweenBlocks.forEach((gap, i) => gap < 0
		// no "orphans". cut centered or not at all
		|| charCountAccumulated[i] < preferedCharCount * 0.35
		|| charCountAccumulated[i] > totalBlockLength - preferedCharCount * 0.4
			? null
			: cuttableIndices.push([i, gap, charCountAccumulated[i]]))
		var gapsInRange = cuttableIndices.filter(([,gap,chars]) =>
		preferedCharCount * 0.6 <= chars && chars <= preferedCharCountMax && gap > 0.5/*sec*/)
		
		// console.log(block.map(node => node.textContent))
		// console.log(cuttableIndices.map(e => e.join(",")))
		// console.log(gapsInRange.map(e => e.join(",")))
		
		var cutBefore
		if (cuttableIndices.length > 0)
			cutBefore = cuttableIndices[0]
		if (gapsInRange.length >= 2)
		// prefer largest gap
			cutBefore = gapsInRange.reduce(([i1, gap1, x1], [i2, gap2, x2]) =>
				gap1 > gap2 ? [i1, gap1, x1] : [i2, gap2, x2])
		if (gapsInRange.length === 1)
			cutBefore = gapsInRange[0]
		if (gapsInRange.length === 0) {
			// find closest match (outside of range)
			cuttableIndices.forEach(([i, gap, chars]) =>
				Math.abs(preferedCharCount - cutBefore[2]) < Math.abs(preferedCharCount - chars) ? null
					: cutBefore = [i, gap, chars])
		}
		if (cuttableIndices.length > 0 && cutBefore) {
			console.assert(cutBefore[0] > 0 && cutBefore[0] < block.length)
			// console.log("cutting at: ", cutBefore)
			blocks[0] = block.slice(0, cutBefore[0])
		} else {
			// console.log("not cuttable")
		}
	}
	
	blocks.forEach(block => alignedGroup = alignedGroup.concat(block))
}

function highlightCurrentWord() {
	if (isWord(currentWord)) {
		var {start, end} = getStartAndEnd(currentWord)
		console.assert(start && end)
		if (end <= video.currentTime) {
			// currentWord is obsolete
			currentWord.classList.remove("active")
			if (!findCurrentWord())
				return
			highlightCurrentWord()
		}
		
		if (video.currentTime < start) {
			// pending (wait)
			if (!video.paused) {
				if (loadAmplitudeChart)
					viewBox.autoPan()
			}
		} else if (video.currentTime < end) {
			// active
			currentWord.classList.add("active")
			if (window.localStorage)
				window.localStorage.lastPlaybackPosition = video.currentTime
		}
	}
}

const linearInterpolation = (low, value, high) => low + value * (high - low)
const spreadFn = (y) => y === 0 ? (x) => x
	: (y > 0
		? (x) => Math.atan((x - 0.5) * y * 2) / Math.atan(y) / 2 + 0.5
		: (x) => Math.tan((x - 0.5) * Math.atan(-y) * 2) / -y / 2 + 0.5 /*inverse*/
)
const easeInOut = spreadFn(2)

function aboutBoxTransitionDo() {
	if (aboutBoxTransition.start === undefined)
		return
	var delta = Date.now() - aboutBoxTransition.start
	console.assert(delta >= 0)
	if (delta > aboutBoxTransition.duration) {
		aboutBoxTransition.start = undefined
		aboutBoxRight = aboutBoxTransition.to
		updateUIpositions()
	} else {
		aboutBoxRight = linearInterpolation(
			aboutBoxTransition.from,
			easeInOut(delta / aboutBoxTransition.duration),
			aboutBoxTransition.to
		)
		updateUIpositions()
		window.requestAnimationFrame(aboutBoxTransitionDo)
	}
}


function aboutBoxSlide(to = 0) {
	aboutBoxTransition.start = Date.now()
	aboutBoxTransition.from = aboutBoxRight
	aboutBoxTransition.to = to
	aboutBoxTransitionDo()
}
const aboutBoxSlideIn = () => aboutBoxSlide(aboutBoxWidth)
const aboutBoxSlideOut = () => aboutBoxSlide(0.001)

const sty = (node, attr, percent) => node.style[attr] = percent * 100 + "%"
function updateUIpositions () {
	sty(transcript, "left", -aboutBoxRight)
	sty(resizer, "left", transcriptWidth - aboutBoxRight)
	sty(tableOfContents, "right", 1 - transcriptWidth + 0.01 + aboutBoxRight)
	sty(videoBox, "right", aboutBoxRight)
	sty(aboutBox, "left", 1 - aboutBoxRight)
}

function transcriptScrollStart(force = false) {
	// do not overwrite ongoing scroll unless forced
	if (scrollTransition.start !== undefined && !force)
		return
	var viewportHeight = transcript.getBoundingClientRect().height
	console.assert(viewportHeight >= 0)
	// disable automatic scrolling if last manual scroll is recent
	var timeSinceLastManualScroll = Date.now() - scrollTransition.lastManualScroll
	if (currentWord && (timeSinceLastManualScroll > 5000 || force) && (currentWord.offsetTop < transcript.scrollTop
		|| transcript.scrollTop + viewportHeight * (1 - scrollTransition.padding) < currentWord.offsetTop)) {
		scrollTransition.start = Date.now()
		scrollTransition.from = transcript.scrollTop
		scrollTransition.to = currentWord.offsetTop - viewportHeight * scrollTransition.padding
	}
}

function transcriptScroll() {
	if (scrollTransition.start === undefined)
		return
	var delta = Date.now() - scrollTransition.start
	console.assert(delta >= 0)
	if (!currentWord || delta > scrollTransition.duration) {
		scrollTransition.start = undefined
		return
	}
	transcript.scrollTop = linearInterpolation(
		scrollTransition.from,
		easeInOut(delta / scrollTransition.duration),
		scrollTransition.to
	)
}

function updateLoop() {
	if (loadAmplitudeChart)
		setPositionLineTo(video.currentTime)
	highlightCurrentWord()
	highlightAlignedGroup()
	if (!video.paused)
		transcriptScrollStart()
	transcriptScroll()
	
	var h = transcript.scrollHeight
	scrollBarHandle.setAttribute("style", "top: " + transcript.scrollTop / h * 100 + "%; height: " + transcript.offsetHeight / h * 100 + "%;")
	
	if (currentWord && currentWord.offsetTop !== 0) {
		currentPosInScrollbar.setAttribute("style", "top: " + currentWord.offsetTop / h * 100 + "%;")
	}
	
	if (windowResize.dirty && Date.now() - windowResize.last > 300) {
		windowResize.dirty = false
		computeScrollBar()
	}
	
	window.requestAnimationFrame(updateLoop)
}

function render(alignJson) {
	var words = alignJson['words']
	var alignTranscript = alignJson['transcript']
	console.assert(words, alignTranscript, transcript.innerHTML === "")
	
	// analysis
	var currentTime = 0
	// words.length === 9840
	words.forEach(function (word) {
		if (word.start === undefined || word['case'] !== "success") {
			return
		}
		// no overlaps apart from imprecision
		console.assert(currentTime < word.start + 0.1)
		// 6 cases are ===
		console.assert(word.start <= word.end)
		// word.alignedWord: case-insentitive and may be "[oov]" => redundant
		delete word.alignedWord
		
		currentTime = word.end
	})
	
	var currentOffset = 0
	
	// now yet available
	//var myWordTag = document.registerElement('x-word', {
	//	prototype: Object.create(HTMLSpanElement.prototype)
	//})
	
	words.forEach(function (word) {
		if (word['case'] == 'not-found-in-transcript' || !word.start) {
			// TODO: show phonemes somewhere
			return
		}
		
		// startOffset & endOffset are character positions
		// Add non-linked text
		if (word.startOffset > currentOffset) {
			var txt = alignTranscript.slice(currentOffset, word.startOffset)
			var $plaintext = document.createTextNode(txt)
			transcript.appendChild($plaintext)
			currentOffset = word.startOffset
		}
		
		var myWord = document.createElement("span")
		var txt = alignTranscript.slice(word.startOffset, word.endOffset)
		myWord.appendChild(document.createTextNode(txt))
		myWord.setAttribute("end", word.end)
		myWord.setAttribute("start", word.start)
		
		word.$div = myWord
		myWord.onclick = function () {
			var start = Number(this.getAttribute("start"))
			video.currentTime = start
			video.play()
		}
		transcript.appendChild(myWord)
		currentOffset = word.endOffset
	})
	
	var txt = alignTranscript.slice(currentOffset, alignTranscript.length)
	var $plaintext = document.createTextNode(txt)
	transcript.appendChild($plaintext)
	currentOffset = alignTranscript.length
}

function clearTranscriptOfStyling() {
	unsetSelectedWord()
	unsetHoveredWord()
	unsetCurrentWord()
	unsetAlignedGroup()
}

function transcriptToXMLstring() {
	removeTranscriptStyling()
	
	return transcript.outerHTML
	// insert newline after <br> to improve readability of raw xml
	// the dot does not match a newline, which is how we avoid inserting another newline, if one already exists
		.replace(/<br>(.)/g, (match, dot) => "<br>\n" + dot)
		// those are generated automatically during editing
		.replace(/&nbsp;/g, " ")
}

function uploadTranscript() {
	clearTranscriptOfStyling()
	
	var xhr = new XMLHttpRequest()
	xhr.onload = function (e) {
		if (xhr.status === 200) {
			notificationAudioSuccess.play()
			console.log("done uploading", xhr)
		} else {
			notificationAudioError.play()
			console.log("error uploading transcript", xhr)
		}
	}
	xhr.open("POST", "uploadTranscript.php")
	xhr.setRequestHeader("Content-Type", "multipart\/form-data")
	if (inputIsAlreadyFlat)
		xhr.setRequestHeader("X-FLAT", "true")
	xhr.send(transcriptToXMLstring())
	resetCurrentWord()
}

function downloadTranscript() {
	download(transcriptToXMLstring(), "text/xml", "transcript.xml")
}

function downloadPath() {
	download(amplitudePath.attr("d"), "text/plain", "pathCache.txt")
}

// file name is ignored :(
function downloadOLD(content, type, name) {
	window.open("data:" + type + "," + encodeURIComponent(content), name)
}

function download(content, type, name) {
	// Firefox requires the link to be in the body
	var link = document.body.appendChild(document.createElement("a"))
	link.download = name
	link.href = "data:" + type + "," + encodeURIComponent(content)
	link.click()
	document.body.removeChild(link)
}

// 2
// 00:00:04,080 --> 00:00:06,080
// Dude - get out of the way!
function downloadSubRipSubtitle(offsetSecs = 0) {
	download(toSubtitle("", ",", offsetSecs), "application/x-subrip", "subtitle_" + offsetSecs + ".srt")
}

function downloadWebVTTSubtitle(offsetSecs = 0) {
	download(toSubtitle("WEBVTT FILE\n\n", ".", offsetSecs), "text/vtt", "subtitle_" + offsetSecs + ".vtt")
}

function toHHMMSSMS(durationInSeconds, decimalSeparator = ",") {
	var hours = Math.floor(durationInSeconds / 60 / 60)
	var minutes = Math.floor((durationInSeconds - 60 * 60 * hours) / 60)
	var seconds = Math.floor(durationInSeconds - 60 * 60 * hours - 60 * minutes)
	var ms = Math.floor((durationInSeconds % 1) * 1000)
	// 00:00:06,080
	return ('00' + hours).slice(-2)
		+ ":" + ('00' + minutes).slice(-2)
		+ ":" + ('00' + seconds).slice(-2)
		+ decimalSeparator + ('000' + ms).slice(-3)
}

function toSubtitle(fileIntro = "", decimalSeparator = ",", offsetSecs = 0, paddingSecs = 1) {
	var chunkIdx = 1
	var srt = []
	video.currentTime = 0
	resetCurrentWord()
	var exists = !!currentWord
	console.log("starting subtitle export")
	
	while (exists) {
		findAlignedGroup()
		console.assert(alignedGroup.length > 0)
		var firstWord = alignedGroup[0]
		console.assert(isWord(firstWord))
		var start = getStartAndEnd(firstWord).start
		var end = alignedGroupEnd()
		
		if (srt.length > 0) {
			// pad start and end times, if space allows it, so subtitles are easier to follow
			var last = srt[srt.length - 1]
			var lastEnd = last[2]
			// -0.05 assures that subtitles never overlap (and start != end)
			var gap = start - lastEnd - 0.05
			last[2] += Math.min(gap / 2, paddingSecs)
			start -= Math.min(gap / 2, paddingSecs)
		}
		
		var text = alignedGroup.map(node => node.textContent).join("")
		srt.push([chunkIdx, start, end, text])
		chunkIdx++
		video.currentTime = end + 0.01
		exists = findCurrentWord()
	}
	
	srt.push([chunkIdx + 1, end + 1, end + 5, "(Transcribed by Matthias Graf, m@mgrf.de.)"])
	
	return fileIntro + srt.map(([chunkIdx, start, end, text]) =>
			chunkIdx + "\n"
			+ toHHMMSSMS(start + offsetSecs, decimalSeparator) + " --> " + toHHMMSSMS(end + offsetSecs, decimalSeparator) + "\n"
			+ text + "\n"
		).join("\n")
}

function parentTrace(node) {
	var parentTrace = []
	while (node !== transcript && node !== document.body) {
		node = node.parentNode
		parentTrace.unshift(node)
	}
	return parentTrace
}

// TODO Element.closest() =?
function closestCommonParentOf2Nodes(nodeA, nodeB) {
	var traceA = parentTrace(nodeA)
	var traceB = parentTrace(nodeB)
	console.assert(traceA.length > 0 && traceB.length > 0)
	var closestCommon = traceA[0]
	traceA.forEach((e, i) => {
		if (i < traceB.length && e === traceB[i])
			closestCommon = e
	})
	return closestCommon
}

function splitParentUntil(node, root) {
	if (node.parentNode !== root)
		console.assert(node.parentNode.tagName && node.parentNode.tagName.match(/^(B|I)$/i))
	// if (node.parentNode !== root && node.parentNode.firstChild !== node)
	// 	console.log("splitting", node, node.parentNode, node.parentNode.textContent)
	while (node.parentNode !== root) {
		if (node.parentNode.firstChild === node) {
			// no need to split parent up
			node = node.parentNode
			continue
		}
		// if nextSibling is null, inserts at the end
		var split = node.parentNode.parentNode.insertBefore(
			document.createElement(node.parentNode.tagName),
			node.parentNode.nextSibling
		)
		while (node.nextSibling)
			split.appendChild(node.nextSibling)
		
		split.insertBefore(node, split.firstChild)
		node = split
	}
	return node
}

function flattenTranscriptToWordGroups() {
	if (inputIsAlreadyFlat) {
		console.log("flattenTranscriptToWordGroups: failed. is already flat.")
		return
	}
	
	video.currentTime = 0
	resetCurrentWord()
	var exists = !!currentWord
	console.log("flattenTranscriptToWordGroups")
	var i = 0
	
	while (exists && i++ < 3000) {
		findAlignedGroup()
		console.assert(alignedGroup.length > 0)
		// console.log(alignedGroup.map(node => node.textContent))
		video.currentTime = alignedGroupEnd() + 0.01
		exists = findCurrentWord()
		
		var firstNode = alignedGroup[0]
		console.assert(isWord(firstNode))
		var lastNode = alignedGroup[alignedGroup.length - 1]
		if (firstNode === lastNode) {
			// this has the good side effect that [Gong] retains its class="Gong"
			continue
		}
		
		var start = getStartAndEnd(firstNode).start
		var end = alignedGroupEnd()
		
		if (firstNode.parentNode !== lastNode.parentNode) {
			let closestCommon = closestCommonParentOf2Nodes(firstNode, lastNode)
			firstNode = splitParentUntil(firstNode, closestCommon)
			lastNode = splitParentUntil(lastNode, closestCommon)
		}
		console.assert(firstNode.parentNode === lastNode.parentNode)
		
		let node = firstNode
		let span = node.parentNode.insertBefore(document.createElement("span"), node)
		span.setAttribute("start", start)
		span.setAttribute("end", end)
		// span will "eat" its way through its level until it devoured lastNode
		while (node) {
			span.appendChild(node)
			if (node === lastNode)
				break
			node = span.nextSibling
		}
		
		alignedGroup.filter(isWord).forEach(unwrap)
		alignedGroup = []
	}
	transcript.removeAttribute("contenteditable")
	inputIsAlreadyFlat = true
	resetCurrentWord()
	highlightAlignedGroup()
}

function loadTranscript(callback) {
	XHR(inputIsAlreadyFlat ? "uploads/transcriptFlat.xml" : "uploads/transcript.xml", function (xhr) {
		if (xhr.status === 404) {
			// fall back
			getJson('media/align.json', function (ret) {
				render(ret)
				callback()
			})
		} else {
			try {
				console.assert(xhr.status === 200)
				var transcriptParent = transcript.parentNode
				transcriptParent.removeChild(transcript)
				var parser = new DOMParser()
				// we can not use xhr.responseXML because it is not treated as HTML (no styling from CSS, etc.)
				// this contains an added html header, so we need to find the transcript first
				var xml = parser.parseFromString(xhr.responseText, "text/html")
				transcript = xml.querySelector("#transcript")
				transcriptParent.appendChild(transcript)
				callback()
			} catch (e) {
				handleError(e)
			}
		}
	})
}

function allWords(fn) {
	var result = []
	var word = transcript.firstChild
	if (!isWord(word))
		word = stepWordDown(word)
	while (word) {
		result.push(word)
		word = stepWordDown(word)
	}
	return result
}

function getSelectedWord() {
	// Node in which the selection begins
	var node = window.getSelection().anchorNode
	while (node && node !== transcript) {
		if (isWord(node))
			return node
		node = node.parentNode
	}
	return null
}

function chartInit(callback) {
	console.assert(window.AudioContext)
	
	// var bodyStyles = window.getComputedStyle(document.body)
	// console.log(bodyStyles.getPropertyValue('--chartHeight'))
	// document.body.style.setProperty('--chartHeight', "15%")
	;
	[transcript, videoBox, tableOfContents].forEach(e => e.style.bottom = "15%")
	
	svg = d3.select("body")
		.append("div")
		.attr("id", "vis")
		.append("svg")
		.attr("xmlns", "http://www.w3.org/2000/svg")
		.attr(":xmlns:xlink", "http://www.w3.org/1999/xlink")
		.attr("viewBox", viewBox)
		.attr("preserveAspectRatio", "none") // distort!
		// fully scale into container
		.attr("width", "100%")
		.attr("height", "100%")
	
	domSvg = document.querySelector("#vis svg")
	
	// TODO domSvg only ?!
	document.body.oncontextmenu = function (e) {
		e.preventDefault()
		return false
	}
	
	console.assert(video.duration > 0)
	// the chart X axis is a 1:1 mapping between pixels and seconds
	svgWidth = video.duration
	
	defineSVGdefs()
	
	svgPageRect = svg.append("rect")
		.attr("id", "svgPageRect")
		.attr("x", 0).attr("y", 0).attr("width", svgWidth + "px").attr("height", svgHeight + "px")
	
	amplitudePath = svg.append("path")
		.classed("audioChart", true)
		.style("fill", "url(#gradient)")
	
	wordAreaSvgGroup = svg.append("g")
	
	positionLine = svg.append("path").attr("id", "position")
	setPositionLineTo(0)
	
	svg.on("click", function () {
		// prevent click after dragend
		if (d3.event.defaultPrevented)
			return
		var mouse = d3.mouse(domSvg)
		setPositionLineTo(mouse[0])
		video.currentTime = mouse[0]
		resetCurrentWord()
		video.play()
	})
	
	var dragStart
	var mousePos
	
	svg.on("mousemove", function (d, i) {
		mousePos = d3.mouse(this)
	}).call(d3.behavior.drag()
		.on("dragstart", function (d) {
			console.log("dragstart")
			dragStart = {x: mousePos[0], y: mousePos[1]}
		})
		.on("drag", function (d) {
			dragInProgress = true
			if (d3.event.sourceEvent.button && d3.event.sourceEvent.button === 2 /*right*/) {
				if (selectedWord) {
					// d3.event.d* only returns incremental, not total delta
					var x = mousePos[0]
					var dx = x - dragStart.x
					var start = dx > 0 ? x - dx : x
					var end = dx <= 0 ? x - dx : x
					
					// limit range of word to not exceed its neighbours
					var [prevEnd, succStart] = getNeighbourBounds()
					console.assert(prevEnd < succStart)
					// a <= b <= c
					start = Math.max(prevEnd, Math.min(start, succStart))
					end = Math.max(prevEnd, Math.min(end, succStart))
					selectedWord.setAttribute("start", start)
					selectedWord.setAttribute("end", end)
					console.assert(start <= end)
					// make sure the rect is visible
					if (start === end)
						end += 0.05
					selectedWord.areaInChart
						.attr("x", start + "px")
						.attr("width", (end - start) + "px") // negative values are invalid
				}
			} else {
				var bb = domSvg.getBoundingClientRect()
				viewBox.x -= d3.event.dx * (viewBox.w / bb.width)
				viewBox.update()
			}
			
		})
		.on("dragend", function (d) {
			dragInProgress = false
		})
	)
	
	function zoom(event) {
		event.preventDefault()
		
		var wheelMovement = Math.max(-1, Math.min(1, (event.wheelDelta || -event.detail)))
		// ok, I cheated a bit ...
		d3.event = event
		var mouse = d3.mouse(domSvg)
		
		var xDelta = viewBox.w * (wheelMovement < 0 ? zoomFactor - 1 : -(1 - 1 / zoomFactor))
		var yDelta = viewBox.h * (wheelMovement < 0 ? zoomFactor - 1 : -(1 - 1 / zoomFactor))
		// zoom towards the current mouse position
		var relX = (mouse[0] - viewBox.x) / viewBox.w // in [0,1]
		var relY = (mouse[1] - viewBox.y) / viewBox.h // in [0,1]
		viewBox.x -= xDelta * relX
		//viewBox.y -= yDelta * relY
		viewBox.w += xDelta
		//viewBox.h += yDelta
		
		viewBox.update()
		d3.event = null
	}
	
	// IE9, Chrome, Safari, Opera
	domSvg.addEventListener("mousewheel", zoom, false)
	// Firefox
	domSvg.addEventListener("DOMMouseScroll", zoom, false)
	
	if (computeAmplitudeChartOn)
		computeAmplitudeChart(callback)
	else
		drawAmplitudeChartFromPathCache(callback)
}

var afterChartWasDrawn = function () {
	if (window.localStorage && window.localStorage.lastPlaybackPosition) {
		try {
			var pos = Number(window.localStorage.lastPlaybackPosition)
			if (pos > 0)
				video.currentTime = pos
		} catch (e) {
		}
	}
	currentWord = transcript.firstChild
	findCurrentWord()
	currentWord.scrollIntoView() // without transition!
	
	if (loadAmplitudeChart) {
		viewBox.autoPan()
	}
}

function addNewWord() {
	var sel = window.getSelection()
	if (sel.isCollapsed) {
		console.log("cannnot create word: selection is empty")
		return
	}
	console.assert(sel.rangeCount === 1)
	
	if (sel.anchorNode === sel.focusNode && sel.anchorNode.nodeType === Node.TEXT_NODE) {
		console.log("most simple case")
		// TODO simplify to: sel.getRangeAt(0).surroundContents(word) ?!?!
		var word = document.createElement("span")
		var range = sel.getRangeAt(0).cloneRange()
		range.surroundContents(word)
		sel.removeAllRanges()
		sel.addRange(range)
		
		var [prevEnd, succStart] = getNeighbourBounds(word)
		word.setAttribute("start", prevEnd)
		word.setAttribute("end", succStart)
		initWord(word)
		unsetSelectedWord()
		setSelectedWord(word)
	}
}

var setSelectedWord = word => setWord("selectedWord", "selectedWord", true, word)
var unsetSelectedWord = (word = selectedWord) => setWord("selectedWord", "selectedWord", false, word)
var setHoveredWord = word => setWord("hovered", "hoveredWord", true, word)
var unsetHoveredWord = (word = hoveredWord) => setWord("hovered", "hoveredWord", false, word)
var setCurrentWord = word => setWord("active", "currentWord", true, word)
var unsetCurrentWord = (word = currentWord) => setWord("active", "currentWord", false, word)

function setWord(clazz, globalVarName, isSet, word) {
	if (word) {
		word.classList[isSet ? "add" : "remove"](clazz)
		if (word.areaInChart)
			word.areaInChart.classed(clazz, isSet)
		window[globalVarName] = isSet ? word : undefined
	}
}

function selectedWordIfRightClick(word) {
	// yep, need all of this crap
	if ((lastMousedownEvent && lastMousedownEvent.button && lastMousedownEvent.button === 2) /*right*/
		|| (d3.event && d3.event.button === 2)) {
		
		unsetSelectedWord()
		setSelectedWord(word)
	}
}

function initWord(word) {
	var {start, end} = getStartAndEnd(word)
	
	function mouseenter() {
		unsetHoveredWord()
		if (!dragInProgress)
			setHoveredWord(word)
	}
	
	function mouseout() {
		unsetHoveredWord(word)
	}
	
	if (loadAmplitudeChart) {
		word.areaInChart = wordAreaSvgGroup.append("rect")
			.classed("wd", true)
			.attr("x", start.toPrecision(xPrecision))
			.attr("y", 0)
			.attr("height", svgHeight)
			.attr("width", (end - start).toPrecision(xPrecision))
			.attr("fill", "url('#wordGradient')")
		word.areaInChart.on("mouseenter", mouseenter)
		word.areaInChart.on("mouseout", mouseout)
		// using mousedown instead would trigger click before drag
		word.areaInChart.on("mouseup", function () {
			if (d3.event.defaultPrevented || dragInProgress) {
				console.log("click prevented")
				return
			}
			selectedWordIfRightClick(word)
		})
	}
	
	word.addEventListener("mouseenter", mouseenter)
	word.addEventListener("mouseout", mouseout)
	word.addEventListener("click", function (e) {
		if (e.ctrlKey || !transcript.hasAttribute("contenteditable")) {
			transcript.removeAttribute("title") // for first ever click
			var {start, end} = getStartAndEnd(word)
			video.currentTime = start
			if (loadAmplitudeChart)
				viewBox.autoPan()
			resetCurrentWord(word)
			transcriptScrollStart(true /*force*/)
			video.play()
		}
	})
}

function convertLineBreakesInTranscriptTextToBR() {
	var node = transcript.firstChild
	while (node) {
		var newNode = stepInTree(node, transcript, false)
		if (node.nodeType === Node.TEXT_NODE && node.wholeText.match(/\n/)) {
			var split = node.wholeText.split("\n")
			console.log("found line break in text node", split)
			
			split.forEach((fragment, i) => {
				if (i > 0)
					node.parentNode.insertBefore(document.createElement("br"), node)
				if (fragment !== "")
					node.parentNode.insertBefore(document.createTextNode(fragment), node)
			})
			node.parentNode.removeChild(node)
		}
		node = newNode
	}
}

// TODO
function filterBoldInTranscript() {
	var treeWalker = document.createTreeWalker(
		transcript,
		NodeFilter.ELEMENT,
		// I can not filter here, because children are not expanded if parents got filtered 
		{acceptNode: node => NodeFilter.FILTER_ACCEPT},
		false
	)
	
	var bs = []
	while (treeWalker.nextNode())
		if (treeWalker.currentNode.tagName && treeWalker.currentNode.tagName.match(/^B$/i))
			bs.push(treeWalker.currentNode)
}

function setDraggedNode(node) {
	draggedNode = node
	document.body.classList.add("dragStyle")
}

function unsetDraggedNode() {
	draggedNode = false
	document.body.classList.remove("dragStyle")
}

function updateScreenElemsSize() {
	windowResize.dirty = true
	windowResize.last = Date.now()
}

function removeTranscriptStyling() {
	nodeListForEach(document.querySelectorAll(".enso, .questionBubble"), function (e) {
		e.parentNode.removeChild(e)
	})
	allWords().forEach(word => {
		if (word.classList.length === 0) {
			word.removeAttribute("class")
		}
	})
}

function addTranscriptStyling() {
	nodeListForEach(document.querySelectorAll(".Gong"), function (e) {
		let img = e.parentNode.insertBefore(document.createElement("img"), e.nextSibling)
		img.setAttribute("src", "assets/Enso.svg")
		img.setAttribute("alt", "[Gong]")
		img.setAttribute("class", "enso")
	})
	nodeListForEach(document.querySelectorAll(".Question"), function (e) {
		let img = e.parentNode.insertBefore(document.createElement("img"), e /*before!*/)
		img.setAttribute("src", "assets/QuestionBubble.svg")
		img.setAttribute("alt", "[Question]")
		img.setAttribute("class", "questionBubble")
	})
}

function clear(node) {
	while (node && node.firstChild)
		node.removeChild(node.firstChild)
}

// modern would be: for (let e of ...)
function nodeListForEach(nodeList, fn) {
	for (var i = 0; i < nodeList.length; i++) {
		fn(nodeList.item(i))
	}
}

function computeScrollBar() {
	if (!inputIsAlreadyFlat)
		return
	
	nodeListForEach(tableOfContents.querySelectorAll(".P, .Q, .GONG, .LISTING"), function (e) {
		tableOfContents.removeChild(e)
	})
	var h = transcript.scrollHeight
	
	// clear(tableOfContents)
	var array = [{start: true, pos: 0}]
	nodeListForEach(document.querySelectorAll("br + span[start]:not(.Gong)"), function (e) {
		array.push({start: true, pos: e.offsetTop})
	})
	nodeListForEach(document.querySelectorAll("span[start] + br, q + br"), function (e) {
		// e.offsetTop === 0 in Chrome (for BR nodes). use sibling instead
		array.push({start: false, pos: e.previousSibling.offsetTop + e.previousSibling.offsetHeight})
	})
	array.push({start: false, pos: h})
	array.sort(({pos: posA}, {pos: posB}) => posA > posB ? 1 : -1)
	var pairs = []
	array.forEach((e, i) => i > 0 ? pairs.push([array[i - 1], e]) : 0)
	// only start/end pairs are needed
	var filtered = pairs.filter(([{start: isStart}, {start: isNotEnd}]) => isStart && !isNotEnd)
	var unwrapped = filtered.map(([{pos: posA}, {pos: posB}]) => [posA, posB])
	console.assert(unwrapped.every(([start, end]) => start <= end && 0 <= start && start <= h))
	
	var addDiv = function (clazz, style) {
		let div = tableOfContents.appendChild(document.createElement("div"))
		if (clazz) div.setAttribute("class", clazz)
		if (style) div.setAttribute("style",
			Object.keys(style).map(key => key + ": " + (style[key] * 100).toFixed(3) + "%").join(";")
		)
		return div
	}
	
	nodeListForEach(document.querySelectorAll("ol, ul"), function (e) {
		let st = e.offsetTop
		let en = st + e.getBoundingClientRect().height
		// split existing block which contains the listing
		let wrapper = unwrapped.filter(([start, end]) => start <= st && en <= end)
		if (wrapper.length === 1) {
			unwrapped.splice(unwrapped.indexOf(wrapper[0]), 1)
			let [start, end] = wrapper[0]
			unwrapped.push([start, st])
			unwrapped.push([en, end])
			addDiv("LISTING", {top: st / h, height: (en - st) / h})
		} else {
			// console.log("WARN: no 1 wrapper found", wrapper)
		}
	})
	
	unwrapped.forEach(([start, end]) => addDiv("P", {top: start / h, height: (end - start) / h}))
	
	nodeListForEach(document.querySelectorAll("br + q"), function (e) {
		addDiv("Q", {top: e.offsetTop / h, height: e.offsetHeight / h})
	})
	nodeListForEach(document.querySelectorAll(".Gong"), function (e) {
		addDiv("GONG", {top: e.offsetTop / h})
	})
}

function onDragAndClickOfTableOfContents(e) {
	let bb = tableOfContents.getBoundingClientRect()
	let percent = (e.clientY - bb.top - scrollBarHandle.getBoundingClientRect().height / 2) / bb.height
	percent = Math.max(0, Math.min(percent, 1))
	transcript.scrollTop = percent * transcript.scrollHeight
	transcript.onscroll()
}

function listenToTranscriptEdits() {
	var observer = new MutationObserver(function (mutations) {
		mutations.forEach(function (mutation) {
			// TODO moving nodes seem to be reported as removedNodes
			if (mutation.type === "childList" && mutation.removedNodes) {
				var resetFlag = false
				for (var i = 0; i < mutation.removedNodes.length; ++i) {
					var node = mutation.removedNodes[i]
					if (isWord(node) && node.areaInChart) {
						node.areaInChart.remove()
						delete node.areaInChart
						alignedGroup = alignedGroup.filter(e => e !== node)
						if (currentWord === node || selectedWord === node || hoveredWord === node) {
							resetFlag = true
						}
					}
				}
				if (resetFlag) {
					selectedWord === undefined
					hoveredWord === undefined
					resetCurrentWord()
				}
			}
		})
	})
	
	// TODO difference subtree & childList ??
	observer.observe(transcript, {subtree: true, childList: true})
	
	document.addEventListener("selectionchange", function (e) {
		var word = getSelectedWord()
		if (word) {
			selectedWordIfRightClick(word)
		}
	})
}

function handleError(e) {
	var err = document.getElementById("errorMessage")
	err.setAttribute("style", "display: block;")
	if (e)
		throw e
}

function afterVideoMetadataLoaded() {
	if (false)
		convertLineBreakesInTranscriptTextToBR()
	
	var prevStart = 0
	var prevEnd = 0.1
	
	function correctWordBoundaries(word) {
		var {start, end} = getStartAndEnd(word)
		if (prevEnd > start) {
			console.log("warning: correcting prevEnd > start")
			start = prevEnd
			word.setAttribute("start", start)
		}
		if (start + 0.05 >= end) {
			console.log("warning: correcting start+0.05 >= end")
			end = start + 0.1
			word.setAttribute("end", end)
		}
		// housekeeping
		if (true) { // adjust precision!
			word.setAttribute("start", start.toPrecision(xPrecision))
			word.setAttribute("end", end.toPrecision(xPrecision))
		}
		if (word.classList.length === 0) {
			word.removeAttribute("class")
		}
		prevStart = start
		prevEnd = end
	}
	
	addTranscriptStyling()
	
	if (loadAmplitudeChart)
		chartInit(afterChartWasDrawn)
	else
		afterChartWasDrawn()
	
	var words = allWords()
	words.forEach(correctWordBoundaries)
	words.forEach(initWord)
	
	window.onresize = function (e) {
		updateScreenElemsSize()
	}
	computeScrollBar()
	
	if (!inputIsAlreadyFlat) {
		listenToTranscriptEdits()
	}
	
	document.body.addEventListener("keydown", function (e) {
		if (e.defaultPrevented) {
			return
		}
		// console.log(e.key) // not supported in chrome
		var char = String.fromCharCode(e.keyCode)
		console.log("keydown: ", e.keyCode, char)
		
		if (e.ctrlKey && !e.shiftKey && char === "S"
		// && document.activeElement === transcript
		// && transcript.hasAttribute("contenteditable")
		) {
			e.preventDefault()
			uploadTranscript()
		}
		if (e.ctrlKey && e.shiftKey && char === "S" && document.activeElement === transcript) {
			e.preventDefault()
			downloadTranscript()
		}
		if (char === "P" && document.activeElement !== transcript) {
			// downloadPath()
			downloadSubRipSubtitle()
			downloadWebVTTSubtitle()
			downloadSubRipSubtitle(/*offset*/58 * 60 + 14)
			downloadWebVTTSubtitle(/*offset*/58 * 60 + 14)
		}
		if (char === "O" && document.activeElement !== transcript) {
			flattenTranscriptToWordGroups()
		}
		if (e.altKey && char === "N" && document.activeElement === transcript) {
			addNewWord()
		}
		if (e.keyCode == 13 /*enter*/ && document.activeElement === transcript) {
			// avoid inserting <div>, use <br> instead
			event.preventDefault()
			document.execCommand("InsertHTML", true, "<br>")
		}
		// TODO ctrl+q is quit in firefox
		if (e.ctrlKey && char === "Q" && document.activeElement === transcript) {
			event.preventDefault() // there is non in chrome
			var sel = document.getSelection()
			if (sel.rangeCount === 1) {
				try {
					// An exception will be thrown, however, if the Range splits a non-Text node with only one of its boundary points.
					// destroys attached area
					sel.getRangeAt(0).surroundContents(document.createElement("q"))
				} catch (e) {
					notificationAudioError2.play()
					throw e
				}
				// http://stackoverflow.com/questions/5222814/window-getselection-return-html
				// document.execCommand("insertHTML", false, q.outerHTML)
			}
		}
		
		if (e.keyCode == 32 /*space*/ && (e.altKey || e.ctrlKey || document.activeElement !== transcript)) {
			e.preventDefault()
			if (video.paused) {
				video.play()
			} else {
				video.pause()
			}
		}
	})
	
	transcript.onscroll = function () {
		if (scrollTransition.start === undefined)
			scrollTransition.lastManualScroll = Date.now()
	}
	
	document.addEventListener("mousedown", function (e) {
		lastMousedownEvent = e
	})
	
	document.addEventListener("mouseup", function () {
		unsetDraggedNode()
	}, /*useCapture*/ true)
	
	document.addEventListener("mousemove", function (e) {
		if (draggedNode === tableOfContents) {
			onDragAndClickOfTableOfContents(e)
		}
		if (draggedNode === resizer) {
			transcriptWidth = e.clientX / document.body.clientWidth
			transcriptWidth = Math.max(0.3, Math.min(transcriptWidth, 0.8))
			
			// asserts that aboutBox is not expanded
			console.assert(aboutBoxRight === 0)
			sty(transcript, "width", transcriptWidth)
			sty(resizer, "left", transcriptWidth)
			sty(tableOfContents, "right", 1 - transcriptWidth + 0.01)
			sty(videoBox, "width", 1 - transcriptWidth)
			// document.body.style.setProperty('--sideWidth', (1-transcriptWidth)*100+"%")
		}
	})
	
	about.addEventListener("mouseenter", aboutBoxSlideIn)
	about.addEventListener("mouseleave", aboutBoxSlideOut)
	aboutBox.addEventListener("mouseenter", aboutBoxSlideIn)
	// mouseout does not work, because it triggers if a child inside the box gets hovered
	aboutBox.addEventListener("mouseleave", aboutBoxSlideOut)
	
	tableOfContents.addEventListener("mousedown", function (e) {
		setDraggedNode(this)
		onDragAndClickOfTableOfContents(e)
	})
	
	resizer.addEventListener("mousedown", function (e) {
		setDraggedNode(this)
	})
	
	video.addEventListener("seeking", function () {
		// on drag/click of seek bar, follow with transcript closely
		resetCurrentWord()
	})
	
	nodeListForEach(video.querySelectorAll("source"), function(source) {
		let li = selectSourceDropdown.appendChild(document.createElement("li"))
		// let li = selectSourceDropdown.insertBefore(document.createElement("li"), selectSourceDropdown.firstChild)
		li.appendChild(document.createTextNode(source.getAttribute("title")))
		li.refSource = source.getAttribute("src")
		if (source === video.querySelector("source") /*current source*/) {
			li.classList.add("current")
		}
		
		li.onclick = function(e) {
			let {start, end} = getStartAndEnd(currentWord)
			video.pause()
			let firstSource = video.querySelector("source")
			firstSource.setAttribute("src", this.refSource)
			nodeListForEach(selectSourceDropdown.querySelectorAll("li"), function(li) {
				li.classList.remove("current")
			})
			this.classList.add("current")
			
			video.onloadedmetadata = function() {
				console.log("loaded new video")
				video.currentTime = start
				video.play()
			}
			video.load()
		}
		
		let li2 = downloadsList.insertBefore(document.createElement("li"), downloadsList.firstChild)
		let a = li2.appendChild(document.createElement("a"))
		a.setAttribute("href", source.getAttribute("src"))
		a.setAttribute("download", true)
		a.innerHTML = source.getAttribute("extendedTitle")
	})
	
	window.requestAnimationFrame(updateLoop)
	
	console.log("all done")
}

var cautiousAfterVideoMetadataLoaded = function (e) {
	console.log("video metadata loaded")
	try {
		afterVideoMetadataLoaded()
	} catch (e) {
		handleError(e)
	}
}

function afterTranscriptLoaded() {
	console.log("transcript loaded")
	if (video.readyState > 0) {
		cautiousAfterVideoMetadataLoaded()
	} else {
		video.onloadedmetadata = cautiousAfterVideoMetadataLoaded
	}
}

function init() {
	try {
		console.assert(video && transcript)
		
		if (transcript.hasChildNodes() && inputIsAlreadyFlat) {
			console.log("transcript is inlined!")
			afterTranscriptLoaded()
		} else {
			// load from xml OR align.json
			loadTranscript(afterTranscriptLoaded)
		}
		
		console.log("synchronous script done")
	} catch (e) {
		handleError(e)
	}
}

init()
