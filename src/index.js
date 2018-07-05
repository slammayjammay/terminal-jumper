const debounce = require('lodash.debounce');
const termSize = require('term-size');
const ansiEscapes = require('ansi-escapes');
const getCursorPosition = require('@patrickkettner/get-cursor-position');
const Tree = require('./Tree');
const Division = require('./Division');
const TextBlock = require('./TextBlock');

const DEFAULT_OPTIONS = {
	divisions: [{
		id: 'default-division',
		top: 0,
		left: 0,
		width: 1
	}]
};

/**
 * TerminalJumper. Helps jumping the cursor to different parts of outputted
 * sections. Useful for clearing specific lines or updating text.
 *
 * @class
 */
class TerminalJumper {
	constructor(options = {}) {
		this.options = Object.assign({}, DEFAULT_OPTIONS, options);

		this._onResizeDebounced = debounce(this._onResizeDebounced.bind(this), 200);

		this._isInitiallyRendered = false;
		this._isChaining = false;
		this._chain = '';
		this._uniqueIdCounter = 0;
		this._bottomDivision = this._topDivision = null;

		this.termSize = this.getTermSize();

		this.divisionsHash = {};
		this.divisions = [];

		this.tree = new Tree();
		this.options.divisions.forEach(options => this.addDivision(options));

		process.stdout.on('resize', this._onResizeDebounced);
	}

	addDivision(options) {
		const id = options.id || `division-${this._uniqueIdCounter++}`;

		const division = new Division(options);
		division.jumper = this;
		division.termSize = this.termSize;
		division.renderPosition = this.renderPosition;

		this.divisionsHash[id] = division;
		this.divisions.push(division);

		this.tree.addDivision(division);

		return division;
	}

	getDivision(id) {
		return  this.divisionsHash[id];

		if (!division) {
			throw new Error(`Could not find division "${divisionId}".`);
		}

		return division;
	}

	removeDivision(division) {
		if (Array.isArray(division)) {
			division.forEach(division => this.removeDivision(division));
			return;
		} else if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		delete this.divisionsHash[division.options.id];
		this.divisions.splice(this.divisions.indexOf(division), 1);

		this.tree.removeDivision(division);
	}

	reset() {
		this.removeDivision(this.divisions.slice());
		this.addDivision(DEFAULT_OPTIONS.divisions[0]);
	}

	topDivision() {
		if (this._topDivision === null) {
			this._topDivision = this._getTopDivision();
		}

		return this._topDivision;
	}

	bottomDivision() {
		if (this._bottomDivision === null) {
			this._bottomDivision = this._getBottomDivision();
		}

		return this._bottomDivision;
	}

	addBlock(targets, text) {
		let division, blockId;

		if (!targets) {
			if (this.divisions.length > 1) {
				throw new Error('Division id must be specified.');
			} else {
				division = this.divisions[0];
			}
		} else if (typeof targets === 'string') {
			const ids = targets.split('.');
			division = this.getDivision(ids[0]);
			blockId = ids[1];
		}

		return division.addBlock(text, blockId);
	}

	hasBlock(targets) {
		const [divisionId, blockId] = targets.split('.');

		if (!divisionId) {
			throw new Error('Division id must be specified.');
		}

		if (!blockId) {
			throw new Error('Block id must be specified.');
		}

		return this.getDivision(divisionId).hasBlock(blockId);
	}

	getBlock(targets, text) {
		const [divisionId, blockId] = targets.split('.');

		if (!divisionId) {
			throw new Error('Division id must be specified.');
		}

		if (!blockId) {
			throw new Error('Block id must be specified.');
		}

		return this.getDivision(divisionId).getBlock(blockId);
	}

	height(division) {
		if (typeof division === 'string') {
			return this.getDivision(divisionId).height();
		}

		if (this._height === null) {
			this._height = this._calculateHeight();
		}

		return this._height;
	}

	/**
	 * Builds a string that will later be written to stdout using #execute().
	 * Calling methods would normally immediately print to the terminal will
	 * instead be appended to an instance variable. Affected methods are:
	 * - render
	 * - erase
	 * - jumpTo
	 */
	chain() {
		if (this._isChaining) {
			return;
		}
		this._isChaining = true;

		return this;
	}

	appendToChain(string) {
		this._chain += string;
		return this;
	}

	execute() {
		if (!this._isChaining) {
			return;
		}
		this._isChaining = false;

		process.stdout.write(this._chain);
		this._chain = '';

		return this;
	}

	render() {
		const str = this.renderString();
		this._isChaining ? this._chain += str : process.stdout.write(str);
		return this;
	}

	renderString() {
		let writeString = '';

		if (!this._isInitiallyRendered) {
			this._isInitiallyRendered = true;
			this.renderPosition = getCursorPosition.sync();
			this._resize();
		}

		const dirtyNodes = this.tree.dirtyNodes();
		const needsRenderNodes = this.tree.needsRenderNodes();

		this.tree.resetDirtyNodes();
		this.tree.resetNeedsRenderNodes();

		for (let { division } of dirtyNodes) {
			division._calculateDimensions(true);
		}

		const numRowsToAllocate = this.renderPosition.row + this.height() - 1 - this.termSize.rows;

		if (numRowsToAllocate > 0) {
			writeString += ansiEscapes.cursorTo(0, this.termSize.rows);
			writeString += new Array(numRowsToAllocate + 1).join('\n');
			this.renderPosition.row -= numRowsToAllocate;
		}

		for (let { division } of needsRenderNodes) {
			writeString += division.renderString();
		}

		writeString += this.jumpToString(this.bottomDivision(), 0, -1);
		writeString += ansiEscapes.cursorLeft;
		writeString += ansiEscapes.cursorDown();
		writeString += ansiEscapes.eraseDown;

		return writeString;
	}

	erase() {
		const str = this.eraseString();
		this._isChaining ? this._chain += str : process.stdout.write(str);
		return this;
	}

	eraseString() {
		let writeString = '';

		for (let division of this.divisions) {
			writeString += division.eraseString();
			this.tree.setNeedsRender(division);
		}

		writeString += this.jumpToString(this.topDivision(), 0, 0);

		return writeString;
	}

	jumpTo(target, col = 0, row = 0) {
		const str = this.jumpToString(target, col, row);
		this._isChaining ? this._chain += str : process.stdout.write(str);
		return this;
	}

	jumpToString(target, col = 0, row = 0) {
		if (!this._isInitiallyRendered) {
			return '';
		}

		let division = target;
		let blockId;

		if (typeof target === 'string') {
			[division, blockId] = target.split('.');
			division = this.getDivision(division);
		}

		return division.jumpToString(blockId, col, row);
	}

	scroll(division, scrollX, scrollY) {
		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		division.scroll(scrollX, scrollY);

		return this;
	}

	scrollX(division, scrollX) {
		return this.scroll(division, scrollX, null);
	}

	scrollY(division, scrollY) {
		return this.scroll(division, null, scrollY);
	}

	scrollUp(division, amount) {
		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		division.scrollUp(amount);

		return this;
	}

	scrollDown(division, amount) {
		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		division.scrollDown(amount);

		return this;
	}

	scrollLeft(division, amount) {
		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		division.scrollLeft(amount);

		return this;
	}

	scrollRight(division, amount) {
		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		division.scrollRight(amount);

		return this;
	}

	getTermSize() {
		const size = termSize();
		size.rows -= 1;
		return size;
	}

	destroy() {
		this.tree.destroy();

		for (let division of this.divisions) {
			division.destroy();
		}

		this.divisions = this.divisionsHash = null;
		this._topDivision = this._bottomDivision = null;
		this.termSize = this.renderPosition = null;

		process.stdout.removeListener('resize', this._onResizeDebounced);
	}

	_setDirty(division) {
		this._height = this._topDivision = this._bottomDivision = null;
		this.tree.setDirty(division);
	}

	_setNeedsRender(division) {
		this.tree.setNeedsRender(division);
	}

	_onResizeDebounced() {
		this._resize();
	}

	_resize() {
		this.termSize = this.getTermSize();

		if (this._isInitiallyRendered) {
			// erase everything on the screen
			process.stdout.write(
				ansiEscapes.cursorTo(this.renderPosition.col - 1, this.renderPosition.row - 1) +
				ansiEscapes.eraseDown
			);
		}

		for (let division of this.divisions) {
			division._resize(this.termSize, this.renderPosition);
		}

		this._setDirty();
		this.render();
	}

	_calculateDimensions() {
		if (this._height === null) {
			this._height = this._calculateHeight();
		}

		if (this._bottomDivision === null) {
			this._bottomDivision = this._getBottomDivision();
		}

		if (this._topDivision === null) {
			this._topDivision = this._getTopDivision();
		}
	}

	_calculateHeight() {
		const heights = this.divisions.map(division => {
			return division.height() + division.top();
		});
		return Math.max(...heights);
	}

	_getTopDivision() {
		return this.divisions.sort((one, two) => {
			return one.top() <= two.top() ? -1 : 1;
		})[0];
	}

	_getBottomDivision() {
		return this.divisions.sort((one, two) => {
			const onePos = one.top() + one.height();
			const twoPos = two.top() + two.height();
			return twoPos > onePos ? 1 : -1;
		})[0];
	}
}

module.exports = TerminalJumper
