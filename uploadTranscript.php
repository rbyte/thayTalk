<?php

file_put_contents(
	isset($_SERVER["HTTP_X_FLAT"])
		? "generated/transcriptFlat.xml"
		: "transcript.xml",
	file('php://input'))
	or exit("error: file_put_contents");
