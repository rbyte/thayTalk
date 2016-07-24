// if JS Harmony is not supported, even parsing the main script fails


function displayError() {
	var err = document.getElementById("errorMessage")
	err.setAttribute("style", "display: block;")
}

try {
	if (window["init"] === undefined) {
		displayError()
	}
} catch(e) {
	displayError()
}
