const ansiEscapes = require('ansi-escapes')
const stripAnsi = require('strip-ansi')
const sliceAnsi = require('slice-ansi')
const wrapAnsi = require('wrap-ansi')
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
		this.text = '';
		this.escapedText = '';

		this.append(text);
	}

	/**
	 * Appends a string of text to this block.
	 *
	 * @param {string} text - The string to append.
	 * @return {TextBlock}
	 */
	append(text) {
		text = text.replace(/\t/g, TAB_FAKER);
		this.text += text;

		return this;
	}

	/**
	 * Overwrite this text block's text with the given string.
	 *
	 * @param {string} text - The text to save to this block.
	 * @return {TextBlock}
	 */
	content(text) {
		this.text = '';
		this.append(text);

		return this;
	}

	height(containerWidth, overflowX, wrapOnWord) {
		return this.getLines(containerWidth, overflowX, wrapOnWord).length;
	}

	/**
	 * @param {string} text - A string with no newlines.
	 */
	getWrappedLine(text, containerWidth, wrapOnWord) {
		if (wrapOnWord) {
			return wrapAnsi(text, containerWidth);
		}

		const textLength = stripAnsi(text).length;

		const lines = [];
		let startIdx = 0;
		let remainder = text;

		do {
			lines.push(sliceAnsi(remainder, 0, containerWidth));

			startIdx += containerWidth;
			remainder = sliceAnsi(remainder, containerWidth);
		} while (startIdx <= textLength);

		return lines.join('\n');
	}

	/**
	 * @param {number} containerWidth - width of container (division) in rows.
	 * @param {string} overflowX - overflowX of container ("wrap|hidden|scroll").
	 * @param {boolean} wrapOnWord - if overflowX is "wrap", whether to break on words.
	 */
	getLines(containerWidth, overflowX, wrapOnWord) {
		if (overflowX === 'wrap') {
			const lines = [];

			for (let line of this.text.split('\n')) {
				const wrapped = this.getWrappedLine(line, containerWidth, wrapOnWord);
				lines.push(...wrapped.split('\n'));
			}

			return lines;
		}

		if (overflowX === 'scroll') {
			return this.text.split('\n');
		}
	}

	getWidthOnRow(row, containerWidth, overflowX, wrapOnWord) {
		const lines = this.getLines(containerWidth, overflowX, wrapOnWord);

		// row position is outside of this box
		if (Math.abs(row) >= lines.length) {
			return null;
		} else if (row < 0) {
			row = lines.length + row;
		}

		return stripAnsi(lines[row]).length;
	}
}

module.exports = TextBlock
