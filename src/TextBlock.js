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

		this._height = this._lines = null;

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

		this._height = this._lines = null;

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
		if (this._height === null) {
			this._height = this._calculateHeight();
		}

		return this._height;
	}

	lines() {
		if (this._lines === null) {
			this._lines = this._getLines();
		}

		return this._lines;
	}

	remove() {
		if (this.division) {
			this.division.removeBlock(this);
		}

		this._height = this._lines = null;
	}

	getRow(row) {
		const lines = this._getLines();

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

	destroy() {
		this.text = this.escapedText = this.division = null;
	}

	_calculateHeight() {
		return this.lines().length;
	}

	_getLines() {
		if (this.division.options.overflowX === 'wrap') {
			const lines = [];
			const divisionWidth = this.division.contentWidth();

			for (let line of this.text.split('\n')) {
				const wrapped = this._getWrappedLine(line, divisionWidth);
				lines.push(...wrapped.split('\n'));
			}

			return lines;
		}

		if (this.division.options.overflowX === 'scroll') {
			return this.text.split('\n');
		}
	}

	/**
	 * Assumes `this.division.options.overflowX === 'wrap'`.
	 * @param {string} text - A string with no newlines.
	 */
	_getWrappedLine(text, divisionWidth) {
		if (this.division.options.wrapOnWord) {
			return wrapAnsi(text, divisionWidth, { trim: false });
		}

		const textLength = stripAnsi(text).length;

		const lines = [];
		let startIdx = 0;
		let remainder = text;

		do {
			lines.push(sliceAnsi(remainder, 0, divisionWidth));

			startIdx += divisionWidth;
			remainder = sliceAnsi(remainder, divisionWidth);
		} while (startIdx <= textLength);

		return lines.join('\n');
	}
}

module.exports = TextBlock
