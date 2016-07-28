<?php

file_put_contents(
	isset($_SERVER["HTTP_X_FLAT"])
		? "uploads/transcriptFlat_USEREDIT.xml"
		: "uploads/transcript_USEREDIT.xml",
	file('php://input'))
	or exit("error: file_put_contents");
