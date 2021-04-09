const ansiEscapes = require('ansi-escapes');
const stripAnsi = require('strip-ansi');
const sliceAnsi = require('slice-ansi');
const wrapAnsi = require('wrap-ansi');
const stringWidth = require('string-width');

// in order to calculate height correctly, translate tab characters into spaces.
// this way we can check if `string.length` is more than `process.sdtout.columns`
const TAB_WIDTH = 8;
const TAB_FAKER = new Array(TAB_WIDTH).join(' ');

/**
 * TextBlock
 * @class
 */
class TextBlock {
	/**
	 * @param {string|array<string>} text - a string or array of strings.
	 */
	constructor(text = '') {
		this.text = this.escapedText = '';
		this._height = this._lines = null;

		this.content(text);
	}

	/**
	 * Overwrite this text block's text with given.
	 *
	 * @param {string|array<string>} text - The text to save to this block.
	 * @return {TextBlock}
	 */
	content(text) {
		let string;

		if (Array.isArray(text)) {
			string = text.join('');
		} else {
			string = text + '';
		}

		string = string.replace(/\t/g, TAB_FAKER);
		string = string.replace('\r', '?');

		const oldEscaped = this.escapedText;
		const oldHeight = this.height();

		const escaped = stripAnsi(string);

		this.text = string;
		this.escapedText = escaped;

		this._height = this._lines = null;

		const hasChanged = (
			stringWidth(escaped) !== stringWidth(oldEscaped) ||
			oldHeight !== this.height()
		);

		if (this.division) {
			hasChanged ? this.division._setDirty() : this.division._setNeedsRender(this);
		}

		return this;
	}

	update() {
		this.content(this.text);
	}

	/**
	 * Appends a string of text to this block.
	 *
	 * @param {string|array<string>} text - The text to append.
	 * @return {TextBlock}
	 */
	append(text) {
		let newText;

		if (typeof this.text === 'string' && typeof text === 'string') {
			newText = this.text + text;
		} else if (typeof this.text === 'string' && Array.isArray(text)) {
			newText = [this.text, ...text];
		} else if (Array.isArray(this.text) && typeof text === 'string') {
			newText = [...this.text, text];
		}

		this.content(newText);

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
		return stringWidth(this.getRow(row));
	}

	destroy() {
		this.text = this.escapedText = this.division = null;
		this._height = this._lines = null;
	}

	_calculateHeight() {
		return this.lines().length;
	}

	_getLines() {
		const textString = Array.isArray(this.text) ? this.text.join('') : this.text;

		if (!this.division) {
			return textString.split('\n');
		}

		if (this.division.options.overflowX === 'wrap') {
			const lines = [];
			const divisionWidth = this.division.contentWidth();

			for (const line of textString.split('\n')) {
				const wrapped = this._getWrappedLine(line, divisionWidth);
				lines.push(...wrapped.split('\n'));
			}

			return lines;
		}

		if (this.division.options.overflowX === 'scroll') {
			return textString.split('\n');
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

		const textLength = stringWidth(text);

		const lines = [];
		let startIdx = 0;
		let remainder = text;

		do {
			lines.push(sliceAnsi(remainder, 0, divisionWidth));

			startIdx += divisionWidth;
			remainder = sliceAnsi(remainder, divisionWidth);
		} while (startIdx <= textLength);

		return lines.filter(s => s !== '').join('\n');
	}
}

module.exports = TextBlock;
