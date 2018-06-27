const ansiEscapes = require('ansi-escapes');
const chalk = require('chalk');
const wrapAnsi = require('wrap-ansi');
const stripAnsi = require('strip-ansi');
const sliceAnsi = require('slice-ansi');
const TextBlock = require('./TextBlock');

const DEFAULT_OPTIONS = {
	/**
	 * The id that TerminalJumper associates with this division.
	 */
	id: null,

	/**
	 * top, left, width are required. Setting height is optional. If not set, will
	 * shrink to the height of the content inside.
	 * All of these properties must be between 0 and 1. They are the percentages
	 * of the terminal viewport. TODO: not this ^
	 */

	/**
	 * @prop {number|string} - If the id of a division is given, will set the top
	 * offset of this division to the bottom of the given division.
	 */
	top: null,
	left: null,
	width: null,
	height: null,

	/**
	 * @prop {string} overflowX - "wrap|scroll".
	 */
	overflowX: 'wrap',

	/**
	 * Only takes effect if the "height" property is set.
	 * @prop {string} overflowY - "auto|scroll".
	 */
	overflowY: 'auto',

	/**
	 * @propt {boolean} wrapOnWord - Wrap on word breaks.
	 */
	wrapOnWord: true
};

class Division {
	constructor(options = {}) {
		this.options = this._parseOptions(options);

		this.top = this.left = this.width = null;
		this._scrollX = this._scrollY = this._maxScrollX = this._maxScrollY = 0;

		this.blockIds = [];
		this.blockHash = {};
		this._allLines = [];
		this._blockPositions = {};
		this._uniqueIdCounter = 0;

		// this._dirty indicates whether block recalculation needs to happen
		// because divisions can scroll, sometimes we'll need to render without
		// recalculations -- this._needsRender.
		this._dirty = this._needsRender = true;
	}

	_parseOptions(options) {
		if (typeof options.width !== 'number') {
			throw new Error(`Options property "width" must be a number between 0 and 1.`);
		}

		if (options.overflowY === 'scroll' && typeof options.height !== 'number') {
			throw new Error('Must set division height when overflowY is "scroll".');
		}

		return Object.assign({}, DEFAULT_OPTIONS, options);
	}

	block(text, options = {}) {
		if (options.id === undefined) {
			options.id = `block-${this._uniqueIdCounter++}`;
		}

		const block = new TextBlock(text);
		this._addBlock(block, options.id);

		return block;
	}

	getBlock(id) {
		return this.blockHash[id];
	}

	height() {
		if (typeof this.options.height === 'number') {
			return ~~(this.options.height * this.termSize.rows);
		}

		if (this._dirty) {
			this._calculateDimensions();
			this._dirty = false;
			this._needsRender = true;
		}

		return this._allLines.length;
	}

	scroll(scrollX, scrollY) {
		if (typeof scrollX === 'number') {
			if (Math.abs(scrollX) > this._maxScrollX) {
				scrollX = this._maxScrollX * (scrollX < 0 ? -1 : 1);
			}

			if (scrollX !== this._scrollX) {
				this._scrollX = scrollX;
				this._needsRender = true;
			}
		}

		if (typeof scrollY === 'number') {
			if (Math.abs(scrollY) > this._maxScrollY) {
				scrollY = this._maxScrollY * (scrollY < 0 ? -1 : 1);
			}

			if (scrollY !== this._scrollY) {
				this._scrollY = scrollY;
				this._needsRender = true;
			}
		}
	}

	/**
	 * Does not output any text. Instead returns the string to print.
	 *
	 * @param {object} renderPosition - The position of the top left corner of the
	 * jumper program.
	 */
	_render(renderPosition) {
		if (!this._dirty && !this._needsRender) {
			return '';
		}

		if (this._dirty) {
			this._calculateDimensions();
			this._dirty = false;
			this._needsRender = true;
		}

		let renderString = '';

		// scrollX and scrollY
		const linesToRender = this._allLines
			.slice(this._scrollY, this._scrollY + this.height())
			.map(line => {
				const truncated = line.slice(this._scrollX, + this._scrollX + this.width);
				const padded = new Array(this.width + 1 - stripAnsi(truncated).length).join(' ');
				return truncated + padded;
			});

		let startLeft = renderPosition.col + this.left - 1;
		let startTop = renderPosition.row + this.top - 1;
		let lineIncrement = 0;

		for (let line of linesToRender) {
			renderString += ansiEscapes.cursorTo(startLeft, startTop + lineIncrement);
			renderString += line;
			lineIncrement += 1;
		}

		this._needsRender = false;

		return renderString;
	}

	/**
	 * A hodge-podge of various attempts at performance optimization.
	 */
	_calculateDimensions() {
		// reset some stuff
		// this._scrollX = this._scrollY = 0;
		this._maxScrollX = this._maxScrollY = 0;
		this._allLines = [];

		let positionYIncrement = 0;

		for (let id of this.blockIds) {
			// store block positions
			this._blockPositions[id].row = -this._scrollY + this.top + positionYIncrement;
			this._blockPositions[id].col = this.left;

			// store an array of all lines in this division, even if they're off-screen
			const blockLines = this.getBlock(id).getLines(this.width, this.options.overflowX, this.options.wrapOnWord);
			this._allLines.push(...blockLines);
			positionYIncrement += blockLines.length;

			// max scrollX
			if (this.options.overflowX === 'scroll') {
				blockLines.forEach(line => {
					const lineLength = stripAnsi(line).length;
					if (lineLength - this.width > this._maxScrollX) {
						this._maxScrollX = lineLength - this.width;
					}
				});
			}
		}

		// max scrollY
		if (this.options.overflowY === 'scroll') {
			this._maxScrollY = this._allLines.length - this.height();
		}
	}

	_resize(terminalSize) {
		this.termSize = terminalSize;
		this._dirty = true;
	}

	_getJumpPos(blockId, col, row) {
		let block;

		if (typeof blockId === 'string') {
			block = this.getBlock(blockId);
			if (!block) {
				throw new Error(`Could not find block "${blockId}".`);
			}
		}

		let width, height, startY;

		if (block) {
			width = block.getWidthOnRow(row, this.width, this.options.overflowX, this.options.wrapOnWord);
			if (width === null) {
				width = this.width;
			}

			height = block.height(this.width, this.options.overflowX);

			startY = this._blockPositions[blockId].row;
			if (row < 0) {
				startY += height;
			}
		} else {
			width = this.width;
			height = this.height();
			startY = (row >= 0) ? this.top : this.top + height;
		}

		const startX = (col >= 0) ? this.left : this.left + width + 1;

		return { col: startX + col, row: startY + row };
	}

	/**
	 * TODO: make option to insert blocks instead of just appending them
	 */
	_addBlock(block, id) {
		this.blockIds.push(id);
		this.blockHash[id] = block;
		this._blockPositions[id] = { row: null, col: null };

		this._dirty = true;
	}
}

module.exports = Division;
