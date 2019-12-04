const ansiEscapes = require('ansi-escapes');
const chalk = require('chalk');
const stringWidth = require('string-width');
const wrapAnsi = require('wrap-ansi');
const stripAnsi = require('strip-ansi');
const sliceAnsi = require('slice-ansi');
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
	 * TODO: this is out of date -- no more right or bottom
	 *
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
	width: null,

	/**
	 * Optional. If not set, will shrink to the height of the content inside.
	 * @prop {number|string}
	 */
	height: null,

	/**
	 * @prop {string} overflowX - "wrap|scroll".
	 */
	overflowX: 'wrap',

	/**
	 * @prop {object} scrollBarX - sets the chars for the scroll bar foreground
	 * and background.
	 * TODO: rewrite this feature to make use of `renderInjects`
	 */
	scrollBarX: false,

	/**
	 * @prop {object} scrollBarY - sets the chars for the scroll bar foreground
	 * and background.
	 */
	scrollBarY: false,

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

		return Object.assign({}, DEFAULT_OPTIONS, options);
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

	getBlockAtIndex(index) {
		const id = this.blockIds[index];

		if (!id) {
			throw new Error(`Could not find block at index "${index}".`);
		}

		return this.getBlock(id);
	}

	hasBlockAtIndex(index) {
		return !!this.blockIds[index];
	}

	removeBlockAtIndex(index) {
		return this.removeBlock(this.getBlockAtIndex(index));
	}

	reset() {
		this._setDirty();

		// TODO: why is this not in _resetDimensions
		this._scrollPosX = this._scrollPosY = 0;

		for (const id of this.blockIds) {
			this.blockHash[id].destroy();
		}

		this.blockIds = [];
		this.blockHash = {};
		this._blockPositions = {};
		this._uniqueIdCounter = 0;
	}

	/**
	 * @param {string|array<string>} content
	 */
	content(content) {
		if (!content) {
			content = [];
		} else if (!Array.isArray(content)) {
			content = [content];
		}

		let [i, l] = [0, content.length];

		for (i; i < l; i++) {
			if (this.hasBlockAtIndex(i)) {
				this.getBlockAtIndex(i).content(content[i]);
			} else {
				this.addBlock(content[i]);
			}
		}

		while (this.hasBlockAtIndex(i)) {
			this.removeBlockAtIndex(i);
		}
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

	naturalWidth() {
		return this.allLines().reduce((longest, line) => {
			return Math.max(longest, stringWidth(line));
		}, 0);
	}

	height() {
		if (this._height === null) {
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

		return this.height() - (this.hasScrollBarX() ? 1 : 0);

		const availableSpace = this.jumper.getAvailableHeight() - this.top() - this.height();
		return this.height() - (availableSpace > 0 ? 0 : 1);
	}

	naturalHeight() {
		return this.allLines().length;
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

		const width = this.width();
		const height = this.height();

		renderString += this.jumper.renderInjects.inject(new RegExp(`^${this.options.id}:before:`));

		// scrollY
		linesToRender = linesToRender.slice(this.scrollPosY(), this.scrollPosY() + height);

		// scrollX
		linesToRender = linesToRender.map(line => {
			line = sliceAnsi(line, this.scrollPosX(), this.scrollPosX() + width);

			// slice-ansi doesn't do surrogate pairs correctly
			const diff = stringWidth(line) - width;
			if (diff > 0) {
				line = sliceAnsi(line, 0, width - diff);
			}

			return line;
		});

		// render vertical scroll bar
		if (this.hasScrollBarY()) {
			const height = this.height();
			const available = height + this.maxScrollY();
			const scrollPos = this.scrollPosY();

			this.jumper.renderInjects.set(`${this.options.id}:after:scroll-bar-y`, () => {
				const scrollBar = this._constructScrollBar('y', height - 1, height, available, scrollPos);
				return this.jumper.jumpToString(this.right() - 1, this.top()) + scrollBar.join(ansiEscapes.cursorMove(-1, 1));
			});
		}

		// render horizontal scroll bar
		if (this.hasScrollBarX()) {
			const width = this.width();
			const available = width + this.maxScrollX();
			const scrollPos = this.scrollPosX();

			this.jumper.renderInjects.set(`${this.options.id}:after:scroll-bar-x`, () => {
				const scrollBar = this._constructScrollBar('x', width, width, available, scrollPos);
				return this.jumper.jumpToString(this.left(), this.bottom() - 1) + scrollBar.join('');
			});
		}

		const startLeft = this.renderPosition.col + this.left();
		const startTop = this.renderPosition.row + this.top();
		let lineIncrement = 0;

		for (const line of linesToRender) {
			renderString += ansiEscapes.cursorTo(startLeft, startTop + lineIncrement) + line;
			lineIncrement += 1;
		}

		renderString += this.jumper.renderInjects.inject(new RegExp(`^${this.options.id}:after:`));

		this._lastRenderCache = { startTop, startLeft, width, height: height };

		return renderString;
	}

	_constructScrollBar(dir = 'x', length, visible, available, scrollPos) {
		let fg, bg;
		const scrollBar = this.options[dir === 'x' ? 'scrollBarX' : 'scrollBarY'];

		if (typeof scrollBar === 'object') {
			[fg, bg] = [scrollBar.foreground, scrollBar.background];
		} else if (dir === 'x') {
			[fg, bg] = [SCROLLBAR_HORIZONTAL_FOREGROUND, SCROLLBAR_HORIZONTAL_BACKGROUND];
		} else if (dir === 'y') {
			[fg, bg] = [SCROLLBAR_VERTICAL_FOREGROUND, SCROLLBAR_VERTICAL_BACKGROUND];
		}

		const fgPercentage = visible / available;
		const barLength = Math.max(1, ~~(length * fgPercentage));
		const barStartIdx = visible + scrollPos === available ?
			length - barLength :
			~~(scrollPos / available * length);
		const barEndIdx = barStartIdx + barLength;

		return [
			...(new Array(barStartIdx)).fill(bg),
			...(new Array(barLength)).fill(fg),
			...(new Array(length - barEndIdx)).fill(bg)
		];
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

		const getDefault = (number, defaultValue) => {
			return Number.isInteger(number) ? number : defaultValue;
		};

		const startLeft = getDefault(cache.startLeft, this.renderPosition.col + this.left());
		const startTop = getDefault(cache.startTop, this.renderPosition.row + this.top());
		const width = getDefault(cache.width, this.width());
		const height = getDefault(cache.height, this.height());

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

	jumpToBlock(block, col = 0, row = 0) {
		process.stdout.write(this.jumpToBlockString(block, col, row));
		return this;
	}

	jumpToBlockString(block, col = 0, row = 0) {
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

		const x = this.renderPosition.col + this.left() + jumpX;
		const y = this.renderPosition.row + this.top() + jumpY;

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
	 */
	_calculateDimensions(force) {
		if (force || this._allLines === null) this._populateLines();
		if (force || this._width === null) this._width = this._calculateWidth();

		if (force || this._height === null) {
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

	_calculateTop() {
		return this.jumper.evaluate(this.options.top, { '%': this.jumper.getAvailableHeight() });
	}

	_calculateLeft() {
		return this.jumper.evaluate(this.options.left, { '%': this.jumper.width() });
	}

	// TODO: width should probably be responsive like height
	_calculateWidth() {
		return this.jumper.evaluate(this.options.width, { '%': this.jumper.width() });
	}

	/**
	 * There is a circular dependency problem when we need to calculate both the
	 * height and the top offset. In order to avoid overflowing the terminal
	 * window, we need to max out the height at some point (which is dependent on
	 * the top offset of the div). However, if `options.bottom` is given, then the
	 * top offset is dependent on the height (number of terminal rows minus the
	 * height).
	 *
	 * Solution: `_calculateHeight` will return `naturalHeight()`, even if it
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
			return this.jumper.evaluate(this.options.height, { '%': this.jumper.getAvailableHeight() });
		}

		return this.naturalHeight() + (this.hasScrollBarX() ? 1 : 0);
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
		return Math.max(0, this.naturalWidth() - this.width());
	}

	_calculateMaxScrollY() {
		return Math.max(0, this.naturalHeight() - this.height());
	}

	_setNeedsRender(block) {
		if (block) {
			this._allLines = null;
		}

		this.jumper.setNeedsRender(this);
	}

	_setDirty() {
		this.jumper.setDirty(this);
	}

	_resetDimensions() {
		if (this.jumper.isInitiallyRendered) {
			this.jumper.renderInjects.set(`before:erase:${this.options.id}`, this.eraseString());
		}

		this._top = this._left = this._width = null;
		this._maxScrollX = this._maxScrollY = null;
		this._height = this._allLines = null;
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
