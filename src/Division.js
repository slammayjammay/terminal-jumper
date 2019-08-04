const ansiEscapes = require('ansi-escapes');
const chalk = require('chalk');
const wrapAnsi = require('wrap-ansi');
const stripAnsi = require('strip-ansi');
const sliceAnsi = require('slice-ansi');
const evaluator = require('./evaluator');
const TextBlock = require('./TextBlock');

const SCROLLBAR_VERTICAL_BACKGROUND = chalk.bold.rgb(102, 102, 102)('⎹');
const SCROLLBAR_VERTICAL_FOREGROUND = chalk.bold.white('⎹');
const SCROLLBAR_HORIZONTAL_BACKGROUND = chalk.rgb(102, 102, 102)('▁');
const SCROLLBAR_HORIZONTAL_FOREGROUND = chalk.white('▁');

const DEFAULT_OPTIONS = {
	/**
	 * The id that TerminalJumper associates with this division.
	 * @prop {string} id - The id of this division.
	 */
	id: null,

	/**
	 * Width is required. So is left (or right) and top (or bottom). You can
	 * specify a fixed number of rows or columns by providing a number. Or you can
	 * provide a percentage of the terminal's dimensions by providing an
	 * expression string. e.g. "50%" or "75% - 4".
	 *
	 * You can align the position of divisions against one another by providing a
	 * another division's id as top/left/right/bottom value. For example if there
	 * are 2 divisions -- `A` with `top: 0`, and `B` with `top: "A"`, B's "top"
	 * position will be top-aligned against the bottom of A.
	 *
	 * Division ids present in evaluation strings need to be surrounded with one
	 * set of curly braces. These will then be replaced by the value associated
	 * with the id, depending on the context. For example if you wanted to top
	 * align one division against the bottom of another and add a 5 row gap:
	 * `top: "{id-to-top-align-against} + 5"`
	 * Here the id and curly braces will be replaced by the row position of the
	 * bottom of the division with id "id-to-top-align-against".
	 */

	/**
	 * @prop {number|string} - If the id of a division is given, will set the top
	 * offset of this division to the bottom of the given division.
	 */
	top: null,

	/**
	 * @prop {number|string} - If the id of a division is given, will set the left
	 * offset of this division to the right of the given division.
	 */
	left: null,

	/**
	 * @prop {number|string}
	 */
	right: null,

	/**
	 * @prop {number|string}
	 */
	bottom: null,

	/**
	 * @prop {number}
	 */
	width: null,

	/**
	 * Optional. If not set, will shrink to the height of the content inside.
	 * @prop {number|string} - If "full", sets the height equal to the height of
	 * the program.
	 */
	height: null,

	/**
	 * @prop {string} overflowX - "wrap|scroll".
	 */
	overflowX: 'wrap',

	/**
	 * @prop {object} scrollBarX - sets the chars for the scroll bar foreground
	 * and background.
	 */
	scrollBarX: false,

	/**
	 * Determines the order of division renders. Divisions with lower renderOrder
	 * will be rendered first. Note that this does not guarantee display order.
	 *
	 * @prop {number} renderOrder - the display order for this division.
	 */
	renderOrder: 0
};

class Division {
	constructor(options = {}) {
		this.options = this._parseOptions(options);

		// calculated values
		this._top = this._left = this._width = this._height = null;
		this._scrollPosX = this._scrollPosY = 0;
		this._maxScrollX = this._maxScrollY = null;
		this._allLines = null;

		this.blockIds = [];
		this.blockHash = {};
		this._blockPositions = {};
		this._uniqueIdCounter = 0;
		this._lastRenderCache = {};
	}

	_parseOptions(options) {
		// must have an id
		if (!options.id) {
			throw new Error(`Options property "id" must be present.`);
		}

		// must have a top/bottom position
		if (
			!['number', 'string'].includes(typeof options.top) &&
			!['number', 'string'].includes(typeof options.bottom)
		) {
			throw new Error('Must set a top or bottom position.');
		}

		// must have a left/right position
		if (
			!['number', 'string'].includes(typeof options.left) &&
			!['number', 'string'].includes(typeof options.right)
		) {
			throw new Error('Must set a left or right position.');
		}

		// must have a width
		if (!['number', 'string'].includes(typeof options.width)) {
			throw new Error('Options property "width" must be given.');
		}

		// if vertical scroll, must have explicit height
		if (options.overflowY === 'scroll' && !['number', 'string'].includes(typeof options.height)) {
			throw new Error('Must set division height when overflowY is "scroll".');
		}

		// if horizontal scroll bars, must set overflowX as scroll
		if (options.scrollBarX && options.overflowX !== 'scroll') {
			throw new Error('Must set overflowX as "scroll" if scroll bars are present.');
		}

		const parsedOptions = Object.assign({}, DEFAULT_OPTIONS, options);

		// set default scrollbar chars
		if (parsedOptions.scrollBarX) {
			parsedOptions.scrollBarX = typeof parsedOptions.scrollBarX === 'object' ? parsedOptions.scrollBarX : {};
			parsedOptions.scrollBarX.background = parsedOptions.scrollBarX.background || SCROLLBAR_HORIZONTAL_BACKGROUND;
			parsedOptions.scrollBarX.foreground = parsedOptions.scrollBarX.foreground || SCROLLBAR_HORIZONTAL_FOREGROUND;
		}

		if (parsedOptions.scrollBarY) {
			parsedOptions.scrollBarY = typeof parsedOptions.scrollBarY === 'object' ? parsedOptions.scrollBarY : {};
			parsedOptions.scrollBarY.background = parsedOptions.scrollBarY.background || SCROLLBAR_VERTICAL_BACKGROUND;
			parsedOptions.scrollBarY.foreground = parsedOptions.scrollBarY.foreground || SCROLLBAR_VERTICAL_FOREGROUND;
		}

		return parsedOptions;
	}

	addBlock(text, id, idx) {
		if (!id) {
			id = id || `block-${this._uniqueIdCounter++}`;
		}

		const block = new TextBlock(text);
		this._addBlock(block, id, idx);

		return block;
	}

	getBlock(id) {
		const block = this.blockHash[id];

		if (!block) {
			throw new Error(`Could not find block "${id}".`);
		}

		return block;
	}

	hasBlock(id) {
		return !!this.blockHash[id];
	}

	removeBlock(block) {
		let id;

		if (typeof block === 'string') {
			id = block;
			block = this.getBlock(block);
		} else {
			id = Object.keys(this.blockHash).find(blockId => {
				return this.blockHash[blockId] === block;
			});
		}

		block.destroy();

		this.blockIds.splice(this.blockIds.indexOf(id), 1);
		delete this.blockHash[id];
		delete this._blockPositions[id];

		this._setDirty();
	}

	reset() {
		this._setDirty();
		this._scrollPosX = this._scrollPosY = 0;

		for (const id of this.blockIds) {
			this.blockHash[id].destroy();
		}

		this.blockIds = [];
		this.blockHash = {};
		this._blockPositions = {};
		this._uniqueIdCounter = 0;
		this._lastRenderCache = {};
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

	right() {
		return this.left() + this.width();
	}

	bottom() {
		return this.top() + this.height();
	}

	width() {
		if (this._width === null) {
			this._width = this._calculateWidth();
			this._maxScrollX = null;
		}

		return this._width;
	}

	/**
	 * Returns the width, after taking scroll bar into account.
	 */
	contentWidth() {
		return this.width() - (this.hasScrollBarY() ? 1 : 0);
	}

	height() {
		if (this.options.height === 'full') {
			this._height = this.jumper.height();
		} else if (this._height === null) {
			this._height = this._calculateHeight();
			this._constrainHeight();
			this._maxScrollY = null;
		}

		return this._height;
	}

	/**
	 * Returns the height, after taking scroll bar into account.
	 */
	contentHeight() {
		if (!this.hasScrollBarX()) {
			return this.height();
		}

		const availableSpace = this.jumper.getAvailableHeight() - this.top() - this.height();
		return this.height() - (availableSpace > 0 ? 0 : 1);
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
				this.jumper.setNeedsRender(this);
			}
		}

		if (typeof scrollY === 'number') {
			scrollY = this._constrainScrollY(scrollY);

			if (scrollY !== this._scrollPosY) {
				this._scrollPosY = scrollY;
				this.jumper.setNeedsRender(this);
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
		const scrollY = Math.max(0, this._constrainScrollY(this._scrollPosY - amount));
		this.scroll(null, scrollY);
		return this;
	}

	scrollDown(amount) {
		const scrollY = Math.max(0, this._constrainScrollY(this._scrollPosY + amount));
		this.scroll(null, scrollY);
		return this;
	}

	scrollLeft(amount) {
		const scrollX = Math.max(0, this._constrainScrollX(this._scrollPosX - amount));
		this.scroll(scrollX, null);
		return this;
	}

	scrollRight(amount) {
		const scrollX = Math.max(0, this._constrainScrollX(this._scrollPosX + amount));
		this.scroll(scrollX, null);
		return this;
	}

	hasScrollBarX() {
		return this.options.scrollBarX && this.maxScrollX() > 0;
	}

	hasScrollBarY() {
		return this.options.scrollBarY && this.maxScrollY() > 0;
	}

	/**
	 * Internally called by TerminalJumper, applicable only for "full height"
	 * divs. Recalculates any dimensions that depend on height.
	 */
	_setHeight(height) {
		this._height = height;
		this._maxScrollY = null;
	}

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
		let linesToRender = this.allLines();

		// scrollY
		linesToRender = linesToRender.slice(this.scrollPosY(), this.scrollPosY() + this.contentHeight());

		// scrollX
		linesToRender = linesToRender.map(line => {
			// slice-ansi is not reliable when styled with multiple colors
			const truncated = sliceAnsi(
				line,
				this.scrollPosX(),
				this.scrollPosX() + this.contentWidth()
			) + chalk.reset(' ').replace(' ', '');
			const length = this.contentWidth() - stripAnsi(truncated).length + 1;
			const padded = new Array(Math.max(0, length)).join(' ');
			return truncated + padded;
		});

		// render vertical scroll bar
		if (this.hasScrollBarY()) {
			const heightPercentage = this.contentHeight() / (this.contentHeight() + this.maxScrollY());
			const scrollBarHeight = ~~(this.contentHeight() * heightPercentage);
			const travelDistance = ~~(this.contentHeight() * (1 - heightPercentage));
			const scrollBarStartIdx = ~~(travelDistance * (this.scrollPosY() / this.maxScrollY()));
			const scrollBarEndIdx = scrollBarStartIdx + scrollBarHeight;

			linesToRender = linesToRender.map((line, idx) => {
				let scrollBarChar;

				if (idx >= scrollBarStartIdx && idx <= scrollBarEndIdx) {
					scrollBarChar = this.options.scrollBarY.foreground;
				} else {
					scrollBarChar = this.options.scrollBarY.background;
				}

				return `${line}${scrollBarChar}`;
			});
		}

		// render horizontal scroll bar
		if (this.hasScrollBarX()) {
			const widthPercentage = this.contentWidth() / (this.contentWidth() + this.maxScrollX());
			const scrollBarWidth = ~~(this.contentWidth() * widthPercentage);
			const travelDistance = ~~(this.contentWidth() * (1 - widthPercentage));
			const scrollBarStartIdx = ~~(travelDistance * (this.scrollPosX() / this.maxScrollX()));

			let horizontalScrollBar = '';
			horizontalScrollBar += new Array(1 + scrollBarStartIdx).join(this.options.scrollBarX.background);
			horizontalScrollBar += new Array(1 + scrollBarWidth).join(this.options.scrollBarX.foreground);
			horizontalScrollBar += new Array(this.contentWidth() - (scrollBarWidth + scrollBarStartIdx)).join(this.options.scrollBarX.background);

			linesToRender.push(horizontalScrollBar);
		}

		const startLeft = this.renderPosition.col + this.left() - 1;
		const startTop = this.renderPosition.row + this.top() - 1;
		let lineIncrement = 0;

		for (const line of linesToRender) {
			renderString += ansiEscapes.cursorTo(startLeft, startTop + lineIncrement);
			renderString += line;
			lineIncrement += 1;
		}

		this._lastRenderCache = {
			startTop,
			startLeft,
			width: this.width(),
			height: this.height()
		};

		return renderString;
	}

	erase() {
		process.stdout.write(this.eraseString(...arguments));
		return this;
	}

	/**
	 * @param {object} [cache] - The values used when this division last rendered.
	 */
	eraseString(cache = { ...this._lastRenderCache }) {
		let writeString = '';

		for (const value of ['startLeft', 'startTop', 'width', 'height']) {
			cache[value] = Number.isInteger(cache[value]) ? cache[value] : null;
		}

		const startLeft = cache.startLeft || this.renderPosition.col + this.left() - 1;
		const startTop = cache.startTop || this.renderPosition.row + this.top() - 1;
		const width = cache.width || this.width();
		const height = (() => {
			if (cache.height) {
				return cache.height;
			} else if (this.options.height === 'full') {
				return this.jumper.height() - this.top();
			} else {
				return this.height();
			}
		})();

		const blankLine = new Array(width + 1).join(' ');

		writeString += ansiEscapes.cursorTo(startLeft, startTop);

		let lineIncrement = 0;
		for (let i = 0; i < height; i++) {
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

		let jumpX = blockColPos - this.scrollPosX();
		let jumpY = blockRowPos - this.scrollPosY();

		// scrollX if off-screen
		if (blockColPos - this.scrollPosX() < 0) {
			this.scrollLeft(Math.abs(jumpX));
			writeString += this.jumper.renderString();
			jumpX = 0;
		} else if (blockColPos - this.scrollPosX() > this.width()) {
			this.scrollRight(Math.abs(jumpX) - this.width());
			writeString += this.jumper.renderString();
			jumpX = this.width();
		}

		// scrollY if off-screen
		if (blockRowPos - this.scrollPosY() < 0) {
			this.scrollUp(Math.abs(jumpY));
			writeString += this.jumper.renderString();
			jumpY = 0;
		} else if (blockRowPos - this.scrollPosY() > this.height()) {
			this.scrollDown(Math.abs(jumpY) - (this.height() - 1));
			writeString += this.jumper.renderString();
			jumpY = this.height() - 1;
		}

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
		this._lastRenderCache = null;

		this.jumper = null;
		this.termSize = this.renderPositions = null;
	}

	/**
	 * A hodge-podge of various attempts at performance optimization.
	 *
	 * @param {boolean} force - Force calculations.
	 *
	 * Steps:
	 *   - populates `this._allLines`
	 *   - calculates width
	 *   - calculates height (depends on `this._allLines`)
	 *   - calculates top (depends on height)
	 *   - calculates left (depends on width)
	 *   - constrain height if extends beyond bounds of terminal
	 *   - sets position of each block (depends on "top" and "left")
	 *   - calculates maxScrollX (depends on `this._allLines` and "width")
	 *   - calculates maxScrollY (depends on `this._allLines` and "height")
	 *   - adjust width/height based on whether scroll bars are present
	 */
	_calculateDimensions(force) {
		if (force || this._allLines === null) this._populateLines();
		if (force || this._width === null) this._width = this._calculateWidth();

		if (this.options.height !== 'full' && (force || this._height === null)) {
			this._height = this._calculateHeight();
		}

		if (force || this._top === null) this._top = this._calculateTop();
		if (force || this._left === null) this._left = this._calculateLeft();

		this._constrainHeight();

		if (force || this._maxScrollX === null) {
			this._maxScrollX = this._calculateMaxScrollX();
			this._scrollPosX = this._constrainScrollX(this._scrollPosX);
		}
		if (force || this._maxScrollY === null) {
			this._maxScrollY = this._calculateMaxScrollY();
			this._scrollPosY = this._constrainScrollY(this._scrollPosY);
		}

		const hasScrollBarX = this.hasScrollBarX();
		const hasScrollBarY = this.hasScrollBarY();

		if (hasScrollBarX && (this.top() + this.height() >= this.jumper.getAvailableHeight())) {
			this._maxScrollY += 1;
		}
		if (hasScrollBarY && this._maxScrollX > 0) {
			this._maxScrollX += 1;
		}
	}

	/**
	 * Wrapper helper for `evaluator.evaluate`. Floors values.
	 */
	evaluate(expression, fnOrObj) {
		return ~~(evaluator.evaluate(expression, fnOrObj));
	}

	/**
	 * @param {string} string - The evaluation string.
	 * @param {function} cb - The callback function, called with the found id,
	 * that returns the value to replace the id with.
	 */
	_replaceId(string, cb) {
		return string.replace(/\{(.*)\}/, (_, id) => {
			if (!this.jumper.hasDivision(id)) {
				throw new Error(`Id "${id}" not found (from expression "${string}").`);
			}
			return cb(id);
		});
	}

	_calculateTop() {
		let { top, bottom } = this.options;

		const isTop = top !== null;
		const prop = isTop ? top : bottom;
		const getAligned = (id) => {
			return this.jumper.getDivision(id)[isTop ? 'bottom' : 'top']();
		};

		let expr = prop;
		// option points to a division id
		if (this.jumper.hasDivision(prop)) expr = getAligned(prop);
		// option points to an expression containing a division id
		else if (typeof prop === 'string') expr = this._replaceId(prop, getAligned);

		let val = this.evaluate(expr, { '%': this.jumper.getAvailableHeight() });
		if (!isTop) {
			val = this.jumper.getAvailableHeight() - this.height() - val;
		}

		return val;
	}

	_calculateLeft() {
		let { left, right } = this.options;

		const isLeft = left !== null;
		const prop = isLeft ? left : right;
		const getAligned = (id) => {
			return this.jumper.getDivision(id)[isLeft ? 'right' : 'left']();
		};

		let expr = prop;
		// option points to a division id
		if (this.jumper.hasDivision(prop)) expr = getAligned(prop);
		// option points to an expression containing a division id
		else if (typeof prop === 'string') expr = this._replaceId(prop, getAligned);

		let val = this.evaluate(expr, { '%': this.width() });
		if (!isLeft) {
			val = this.jumper.width() - this.width() - val;
		}

		return val;
	}

	_calculateWidth() {
		return this.evaluate(this.options.width, { '%': this.jumper.width() });
	}

	/**
	 * There is a circular dependency problem when we need to calculate both the
	 * height and the top offset. In order to avoid overflowing the terminal
	 * window, we need to max out the height at some point (which is dependent on
	 * the top offset of the div). However, if `options.bottom` is given, then the
	 * top offset is dependent on the height (number of terminal rows minus the
	 * height).
	 *
	 * Solution: `_calculateHeight` will return `allLines().length`, even if it
	 * overflows the terminal window. Afterward, `_constrainHeight` needs to be
	 * called to avoid the overflow (this will depend on the top offset). And
	 * between the two, the top offset will be calculated. It will possibly be
	 * using an incorrect height (too large), but the only problem that can arise
	 * is that the top offset is negative, so it will have a minimum of 0.
	 *
	 * 1) Calculate, but do not clamp, height
	 * 2) Calculate top offset if necessary
	 * 3) Constrain height -- must always be called after calculating height
	 */
	_calculateHeight() {
		if (this.options.height) {
			return this.evaluate(this.options.height, { '%': this.jumper.getAvailableHeight() });
		}

		return this.allLines().length;
	}

	/**
	 * Prevents any/all divisions from overflowing the height of the terminal.
	 * Calculates top offset if not done already.
	 */
	_constrainHeight() {
		if (this._height === null) {
			throw new Error(`Internal error: height must be calculated before it can be constrained.`);
		}
		if (this._top === null) {
			this._top = this._calculateTop();
		}

		this._height = Math.min(this._height, this.jumper.getAvailableHeight() - this.top());
	}

	_populateLines() {
		this._allLines = [];
		let posYInc = 0;

		for (let id of this.blockIds) {
			const block = this.getBlock(id);
			this._allLines.push(...block.lines());

			this._blockPositions[id].row = posYInc;
			this._blockPositions[id].col = 0;

			posYInc += block.height();
		}

		// need to be recalculated
		this._maxScrollX = this._maxScrollY = null;
	}

	_calculateMaxScrollX() {
		const lineLengths = this.allLines().map(line => {
			return stripAnsi(line).length - this.width();
		});

		return Math.max(...lineLengths, 0);
	}

	_calculateMaxScrollY() {
		return Math.max(0, this.allLines().length - this.height());
	}

	_setNeedsRender(block) {
		if (block) {
			this._height = this._allLines = null;
		}

		this.jumper.setNeedsRender(this);
	}

	_setDirty() {
		this.jumper.setDirty(this);
	}

	_resetDimensions() {
		if (this.jumper.isInitiallyRendered) {
			const cache = this._lastRenderCache;
			this.jumper.forNextRender.set(`erase-${this.options.id}`, () => {
				return this.eraseString(cache);
			});
		}

		this._top = this._left = this._width = null;
		this._maxScrollX = this._maxScrollY = null;
		this._allLines = null;

		if (this.options.height !== 'full') {
			this._height = null;
		}
	}

	_resize(terminalSize, renderPosition) {
		this.termSize = terminalSize;
		this.renderPosition = renderPosition;
	}

	_addBlock(block, id, idx = this.blockIds.length) {
		this.blockIds.splice(idx, 0, id);
		this.blockHash[id] = block;
		this._blockPositions[id] = { row: null, col: null };
		block.division = this;

		this._setDirty();

		return block;
	}
}

module.exports = Division;
