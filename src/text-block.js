const ansiEscapes = require('ansi-escapes')
const stripAnsi = require('strip-ansi')
const getCursorPosition = require('@patrickkettner/get-cursor-position')

// in order to calculate height correctly, translate tab characters into spaces.
// this way we can check if `string.length` is more than `process.sdtout.columns`
const TAB_WIDTH = 8;
const TAB_FAKER = new Array(TAB_WIDTH).join(' ');

/**
 * TextBlock
 * @class
 */
class TextBlock {
	constructor(text = '') {
		this.text = ''
		this.escapedText = ''
		this.length = 0
		this.position = null

		this.append(text)
	}

	/**
	 * Appends a string of text to this block.
	 *
	 * @param {string} text - The string to append.
	 * @return {TextBlock}
	 */
	append(text) {
		text = text.replace(/\t/g, TAB_FAKER);

		this.text += text
		this.escapedText = stripAnsi(this.text)
		this.length = this.text.length

		return this
	}

	/**
	 * Overwrite this text block's text with the given string.
	 *
	 * @param {string} text - The text to save to this block.
	 * @return {TextBlock}
	 */
	content(text) {
		this.text = ''
		this.append(text)

		return this
	}

	/**
	 * Returns the number or rows this text block fills.
	 *
	 * @return {number}
	 */
	height() {
		let height = 0
		let lines = this.escapedText.split('\n')

		for (let line of lines) {
			height += 1

			if (line.length > process.stdout.columns) {
				height += 1
			}
		}

		return height
	}

	/**
	 * Outputs this text block's content and saves the cursor position.
	 */
	render() {
		this.position = getCursorPosition.sync()

		const lines = this.text.split('\n');
		for (const line of lines) {
			let text = ansiEscapes.cursorLeft;
			text += ansiEscapes.eraseEndLine;
			text += line + '\n';

			process.stdout.write(text);
		}
	}

	/**
	 * Jumps the cursor to a column and row within this text block.
	 *
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
