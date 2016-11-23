const ansiEscapes = require('ansi-escapes')
const stripAnsi = require('strip-ansi')
const getCursorPosition = require('get-cursor-position')

class TextBlock {
	constructor(text = '') {
		this.text = ''
		this.escapedText = ''
		this.length = 0
		this.position = null
		this.offsetCount = 0

		this.append(text)
	}

	append(text) {
		this.text += text
		this.escapedText = stripAnsi(this.text)
		this.length = this.text.length

		return this
	}

	/**
	 * @param {integer} idx - The index to begin overwriting.
	 */
	content(text) {
		this.text = ''
		this.append(text)
		return this
	}

	height() {
		return this.text.split('\n').length
	}

	render() {
		this.position = getCursorPosition.sync()
		console.log(this.text)
	}

	updatePositionOffset(offsetCount) {
		this.position.row -= offsetCount
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
		let textArr = this.escapedText.split('\n')
		if (y > this.height() - 1) {
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
