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

		this.escapedText = stripAnsi(this.text);

		if (this.division) {
			this.division._setDirty();
		}

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

	height() {
		return this.getLines().length;
	}

	remove() {
		if (this.division) {
			this.division.remove(this);
		}
	}

	/**
	 * Assumes `this.division.options.overflowX === 'wrap'`.
	 * @param {string} text - A string with no newlines.
	 */
	getWrappedLine(text) {
		if (this.division.options.wrapOnWord) {
			return wrapAnsi(text, this.division.width(), { trim: false });
		}

		const textLength = stripAnsi(text).length;

		const lines = [];
		let startIdx = 0;
		let remainder = text;

		do {
			lines.push(sliceAnsi(remainder, 0, this.division.width()));

			startIdx += this.division.width();
			remainder = sliceAnsi(remainder, this.division.width());
		} while (startIdx <= textLength);

		return lines.join('\n');
	}

	getLines() {
		if (this.division.options.overflowX === 'wrap') {
			const lines = [];

			for (let line of this.text.split('\n')) {
				const wrapped = this.getWrappedLine(line);
				lines.push(...wrapped.split('\n'));
			}

			return lines;
		}

		if (this.division.options.overflowX === 'scroll') {
			return this.text.split('\n');
		}
	}

	getRow(row) {
		const lines = this.getLines();

		if (Math.abs(row) >= lines.length) {
			throw new Error(`Row position "${row}" is outside this block.`);
		}

		if (row < 0) {
			row = lines.length + row;
		}

		return lines[row];
	}

	getWidthOnRow(row) {
		return stripAnsi(this.getRow(row)).length;
	}
}

module.exports = TextBlock
