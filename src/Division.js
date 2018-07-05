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

	/**
	 * @prop {number|string} - If the id of a division is given, will set the left
	 * offset of this division to the bottom of the given division.
	 */
	left: null,

	/**
	 * @prop {number}
	 */
	width: null,

	/**
	 * @prop {number}
	 */
	height: null,

	/**
	 * @prop {string} overflowX - "wrap|scroll".
	 */
	overflowX: 'wrap',

	/**
	 * If set to "auto", the division content determines the division height,
	 * until the program fills up the entire screen. At that point, the division
	 * will scroll any content outside of the viewport.
	 *
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

		this._top = this._left = this._width = this._height = null;
		this._scrollPosX = this._scrollPosY = 0;
		this._maxScrollX = this._maxScrollY = null;
		this._allLines = null;

		this.blockIds = [];
		this.blockHash = {};
		this._blockPositions = {};
		this._uniqueIdCounter = 0;
	}

	_parseOptions(options) {
		if (!options.id) {
			throw new Error(`Options property "id" must be present.`);
		}

		if (typeof options.width !== 'number') {
			throw new Error(`Options property "width" must be a number between 0 and 1.`);
		}

		if (options.overflowY === 'scroll' && typeof options.height !== 'number') {
			throw new Error('Must set division height when overflowY is "scroll".');
		}

		return Object.assign({}, DEFAULT_OPTIONS, options);
	}

	addBlock(text, id) {
		if (!id) {
			id = id || `block-${this._uniqueIdCounter++}`;
		}

		const block = new TextBlock(text);
		this._addBlock(block, id);

		return block;
	}

	getBlock(id) {
		const block = this.blockHash[id];

		if (!block) {
			throw new Error(`Could not find block "${id}".`);
		}

		return block;
	}

	remove(block) {
		let id;

		if (typeof block === 'string') {
			id = block;
			block = this.getBlock(block);
		} else {
			id = Object.keys(this.blockHash).find(blockId => {
				return this.blockHash[blockId] === block;
			});
		}

		this.blockIds.splice(this.blockIds.indexOf(id), 1);
		delete this.blockHash[id];
		delete this._blockPositions[id];

		this._setDirty();
	}

	hasBlock(id) {
		return !!this.blockHash[id];
	}

	top() {
		if (this._top === null) {
			this._top = this._calculateTop();
		}

		return this._top;
	}

	left() {
		if (this._left === null) {
			this._left = this._calculateLeft();
		}

		return this._left;
	}

	width() {
		if (this._width === null) {
			this._width = this._calculateWidth();
		}

		return this._width;
	}

	height() {
		if (this._height === null) {
			this._height = this._calculateHeight();
		}

		return this._height;
	}

	allLines() {
		if (this._allLines === null) {
			this._populateLines();
		}

		return this._allLines;
	}

	scrollPosX() {
		if (this._scrollPosX === null) {
			this._scrollPosX = this._constrainScrollX(this._scrollPosX);
		}

		return this._scrollPosX;
	}

	scrollPosY() {
		if (this._scrollPosY === null) {
			this._scrollPosY = this._constrainScrollY(this._scrollPosY);
		}

		return this._scrollPosY;
	}

	maxScrollX() {
		if (this._maxScrollX === null) {
			this._maxScrollX = this._calculateMaxScrollX();
		}

		return this._maxScrollX;
	}


	maxScrollY() {
		if (this._maxScrollY === null) {
			this._maxScrollY = this._calculateMaxScrollY();
		}

		return this._maxScrollY;
	}

	scroll(scrollX, scrollY) {
		if (typeof scrollX === 'number') {
			scrollX = this._constrainScrollX(scrollX);

			if (scrollX !== this._scrollPosX) {
				this._scrollPosX = scrollX;
				this.jumper._setNeedsRender(this);
			}
		}

		if (typeof scrollY === 'number') {
			scrollY = this._constrainScrollY(scrollY);

			if (scrollY !== this._scrollPosY) {
				this._scrollPosY = scrollY;
				this.jumper._setNeedsRender(this);
			}
		}

		return this;
	}

	scrollX(scrollX) {
		return this.scroll(scrollX, null);
	}

	scrollY(scrollY) {
		return this.scroll(null, scrollY);
	}

	scrollUp(amount) {
		const scrollY = this._constrainScrollY(this._scrollPosY - amount);
		this.scroll(null, scrollY);
		return this;
	}

	scrollDown(amount) {
		const scrollY = this._constrainScrollY(this._scrollPosY + amount);
		this.scroll(null, scrollY);
		return this;
	}

	// TODO: scrollLeft(), scrollRight()

	_constrainScrollX(scrollX) {
		if (Math.abs(scrollX) > this.maxScrollX()) {
			scrollX = this.maxScrollX() * (scrollX < 0 ? -1 : 1);
		}
		return scrollX;
	}

	_constrainScrollY(scrollY) {
		if (Math.abs(scrollY) > this.maxScrollY()) {
			scrollY = this.maxScrollY() * (scrollY < 0 ? -1 : 1);
		}
		return scrollY;
	}

	render() {
		process.stdout.write(this.renderString());
		return this;
	}

	renderString() {
		let renderString = '';

		// scrollX and scrollY
		const linesToRender = this.allLines()
			.slice(this.scrollPosY(), this.scrollPosY() + this.height())
			.map(line => {
				const truncated = sliceAnsi(line, this.scrollPosX(), this.scrollPosX() + this.width());
				const padded = new Array(this.width() + 1 - stripAnsi(truncated).length).join(' ');
				return truncated + padded;
			});

		const startLeft = this.renderPosition.col + this.left() - 1;
		const startTop = this.renderPosition.row + this.top() - 1;
		let lineIncrement = 0;

		for (let line of linesToRender) {
			renderString += ansiEscapes.cursorTo(startLeft, startTop + lineIncrement);
			renderString += line;
			lineIncrement += 1;
		}

		return renderString;
	}

	erase() {
		process.stdout.write(this.eraseString());
		return this;
	}

	eraseString() {
		let writeString = '';

		const blankLine = new Array(this.width()).join(' ');

		const startLeft = this.renderPosition.col + this.left() - 1;
		const startTop = this.renderPosition.row + this.top() - 1;
		let lineIncrement = 0;

		writeString += ansiEscapes.cursorTo(startLeft, startTop);

		for (let i = 0, height = this.height(); i < height; i++) {
			writeString += ansiEscapes.cursorTo(startLeft, startTop + lineIncrement);
			writeString += blankLine;
			lineIncrement += 1;
		}

		return writeString;
	}

	jumpTo(block, col = 0, row = 0) {
		process.stdout.write(this.jumpToString(block, col, row));
		return this;
	}

	jumpToString(block, col = 0, row = 0) {
		if (block) {
			return this._jumpToBlockString(block, col, row);
		}

		const jumpX = (col >= 0) ? this.left() : this.left() + this.width() + 1;
		const jumpY = (row >= 0) ? this.top() : this.top() + this.height();

		const x = this.renderPosition.col - 1 + jumpX + col;
		const y = this.renderPosition.row - 1 + jumpY + row;

		return ansiEscapes.cursorTo(x, y);
	}

	_jumpToBlockString(block, col = 0, row = 0) {
		let writeString = '';

		let blockId = null;

		if (typeof block === 'string') {
			blockId = block;
			block = this.getBlock(block);
		} else {
			blockId = Object.keys(this.blockHash).find(blockId => {
				return this.blockHash[blockId] === block;
			});
		}

		const blockPos = this._blockPositions[blockId];
		const blockRowPos = blockPos.row + row + (row < 0 ? block.height() : 0);
		const blockColPos = blockPos.col + col + (col < 0 ? block.getWidthOnRow(row) + 1 : 0);

		// if the block row is off-screen, we need to scroll
		if (blockRowPos - this.scrollPosY() < 0) {
			this.scrollUp(blockRowPos);
			writeString += this.jumper.renderString();
		} else if (blockRowPos  - this.scrollPosY() > this.height()) {
			this.scrollDown(blockRowPos - (this.height() - 1));
			 writeString += this.jumper.renderString();
		}

		// TODO: get this working
		// if (blockColPos - this.scrollPosX() < 0) {
		// 	this.scrollLeft(blockColPos);
		// } else if (blockColPos  - this.scrollPosX() > this.width()) {
		// 	this.scrollUp(blockColPos - this.width());
		// }

		const jumpX = blockColPos - this.scrollPosX();
		const jumpY = blockRowPos - this.scrollPosY();

		const x = this.renderPosition.col - 1 + this.left() + jumpX;
		const y = this.renderPosition.row - 1 + this.top() + jumpY;

		writeString += ansiEscapes.cursorTo(x, y);

		return writeString;
	}

	destroy() {
		for (let id of this.blockIds) {
			this.blockHash[id].destroy();
		}

		this.options = null;
		this._allLines = null;
		this.blockIds = this.blockHash = this._blockPositions = null;

		this.jumper = null;
		this.termSize = this.renderPositions = null;
	}

	/**
	 * A hodge-podge of various attempts at performance optimization.
	 *
	 * @param {boolean} force - Force calculations.
	 *
	 * Steps:
	 *   - calculates top
	 *   - calculates left
	 *   - calculates width
	 *   - populates `this._allLines`
	 *   - calculates height (depends on `this._allLines`)
	 *   - sets position of each block (depends on "top" and "left")
	 *   - calculates maxScrollX (depends on `this._allLines` and "width")
	 *   - calculates maxScrollY (depends on `this._allLines` and "height")
	 */
	_calculateDimensions(force) {
		if (force || this._top === null) this._top = this._calculateTop();
		if (force || this._left === null) this._left = this._calculateLeft();
		if (force || this._width === null) this._width = this._calculateWidth();
		if (force || this._allLines === null) this._populateLines();
		if (force || this._height === null) this._height = this._calculateHeight();
		if (force || this._maxScrollX === null) this._maxScrollX = this._calculateMaxScrollX();
		if (force || this._maxScrollY === null) this._maxScrollY = this._calculateMaxScrollY();
	}

	_calculateTop() {
		if (typeof this.options.top === 'string') {
			const targetDivision = this.jumper.getDivision(this.options.top);
			return targetDivision.top() + targetDivision.height();
		} else {
			return ~~(this.options.top * this.termSize.rows);
		}
	}

	_calculateLeft() {
		if (typeof this.options.left === 'string') {
			const targetDivision = this.jumper.getDivision(this.options.left);
			return targetDivision.left() + targetDivision.width();
		} else {
			return ~~(this.options.left * this.termSize.columns);
		}
	}

	_calculateWidth() {
		return ~~(this.options.width * this.termSize.columns);
	}

	_calculateHeight() {
		if (typeof this.options.height === 'number') {
			return ~~(this.options.height * this.termSize.rows);
		}

		let height = this.allLines().length;

		// if division fills up viewport height, convert to scroll
		if (this.top() + height > this.termSize.rows - 1) {
			height = this.termSize.rows - 1 - this.top();
		}

		return height;
	}

	_populateLines() {
		this._allLines = [];
		let posYInc = 0;

		for (let id of this.blockIds) {
			const block = this.getBlock(id);
			this._allLines.push(...block.getLines());

			this._blockPositions[id].row = posYInc;
			this._blockPositions[id].col = 0;

			posYInc += block.height();
		}

		// need to be recalculated
		this._maxScrollX = this._maxScrollY = null;
	}

	_calculateMaxScrollX() {
		const lineLengths = this._allLines.map(line => {
			return stripAnsi(line).length - this.width();
		});

		return Math.max(...lineLengths, 0);
	}

	_calculateMaxScrollY() {
		return this.allLines().length - this.height();
	}

	_setDirty() {
		this._resetDimensions();

		if (this.jumper) {
			this.jumper._setDirty(this);
		}
	}

	_resetDimensions() {
		this._top = this._left = this._width = this._height = null;
		this._maxScrollX = this._maxScrollY = null;
		this._allLines = null;
	}

	_resize(terminalSize, renderPosition) {
		this.termSize = terminalSize;
		this.renderPosition = renderPosition;
	}

	/**
	 * TODO: make option to insert blocks instead of just appending them
	 */
	_addBlock(block, id) {
		this.blockIds.push(id);
		this.blockHash[id] = block;
		this._blockPositions[id] = { row: null, col: null };
		block.division = this;

		this._setDirty();

		return block;
	}
}

module.exports = Division;
