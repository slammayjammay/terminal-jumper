const stripAnsi = require('strip-ansi')

class Line {
	constructor(text) {
		this.text = text
		this.escaped = stripAnsi(text)
		this.length = this.text.length
	}
}

module.exports = Line
