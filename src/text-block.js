const ansiEscapes = require('ansi-escapes')
const stripAnsi = require('strip-ansi')
const getCursorPosition = require('get-cursor-position')

class TextBlock {
	constructor(text) {
		this.text = text
		this.escaped = stripAnsi(text)
		this.length = this.text.length
		this.height = this.text.split('\n').length

		this.offsetCount = 0
	}

	/**
	 * Prints all text content. Keeps track of how many times the screen scrolled.
	 */
	render() {
		let lines = this.text.split('\n')

		for (let line of lines) {
			let beforePos = getCursorPosition.sync()
			console.log(line)
			let afterPos = getCursorPosition.sync()

			if (afterPos.row === beforePos.row) {
				this.offsetCount += 1
			}
		}
	}

	/**
	 * Called immediately after the parent section is rendered.
	 */
	getOffsetCount() {
		let offsetCount = this.offsetCount
		this.offsetCount = 0
		return offsetCount
	}

	/**
	 * @param {integer} x - The x position. If negative, will jump to the end of the line.
	 * @param {integer} y - The y position.
	 */
	jumpTo(x, y) {
		let textArr = this.escaped.split('\n')
		if (y > this.height - 1) {
			throw 'y position is greater than text height.'
		}

		// ansiEscapes.cursorDown(0) still moves the cursor down a line. No good.
		if (y > 0) {
			process.stdout.write(ansiEscapes.cursorDown(y))
		}

		process.stdout.write(ansiEscapes.cursorLeft)
		if (x < 0) {
			// jump to the end of this line
			let lineLength = textArr[y].length
			process.stdout.write(ansiEscapes.cursorMove(lineLength))
			process.stdout.write(ansiEscapes.cursorMove(x + 1))
		} else {
			process.stdout.write(ansiEscapes.cursorMove(x))
		}
	}
}

module.exports = TextBlock
