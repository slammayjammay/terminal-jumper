const debounce = require('lodash.debounce');
const termSize = require('term-size');
const ansiEscapes = require('ansi-escapes');
const getCursorPosition = require('@patrickkettner/get-cursor-position');
const Division = require('./Division');
const TextBlock = require('./TextBlock');

const DEFAULT_OPTIONS = {
	divisions: [{
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
		this._uniqueIdCounter = 0;
		this._dirty = true;
		this._bottomDivision = this._topDivision = null;

		this.termSize = termSize();

		this.divisionsHash = {};
		this.divisions = [];

		this._affectedDivisions = {};

		this.options.divisions.forEach(options => this.addDivision(options));

		process.stdout.on('resize', this._onResizeDebounced);
	}

	addDivision(options) {
		const id = options.id || `division-${this._uniqueIdCounter++}`;
		const division = new Division(options);

		division.jumper = this;
		division.termSize = this.termSize;

		this.divisionsHash[id] = division;
		this.divisions.push(division);

		// does this division's position depend on another one?
		const topDepends = typeof division.options.top === 'string';
		const leftDepends = typeof division.options.left === 'string';
		const alreadyInit = !this._affectedDivisions[division.options.top];

		if ((topDepends || leftDepends) && alreadyInit) {
			if (!this._affectedDivisions[division.options.top]) {
				this._affectedDivisions[division.options.top] = [];
			}
		}

		if (topDepends) {
			this._affectedDivisions[division.options.top].push(division);
		}

		if (leftDepends) {
			this._affectedDivisions[division.options.left].push(division);
		}

		return division;
	}

	getDivision(id) {
		return  this.divisionsHash[id];

		if (!division) {
			throw new Error(`Could not find division "${divisionId}".`);
		}

		return division;
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
		const [divisionId, blockId] = targets.split('.');

		if (!divisionId) {
			throw new Error('Division id must be specified.');
		}

		return this.getDivision(divisionId).addBlock(text, blockId);
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

	remove(targets) {
		let division, block;

		if (typeof targets === 'string') {
			const [divisionId, block] = targets.split('.');
			division = this.getDivision(divisionId);
		} else if (targets instanceof TextBlock) {
			[division, block] = [targets.division, targets];
		}

		return division.remove(block);
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

	chain(...writeStrings) {
		let writeString = '';

		for (let string of writeStrings) {
			if (typeof string === 'string') {
				writeString += string;
			}
		}

		process.stdout.write(writeString);
	}

	render() {
		process.stdout.write(this.renderString());
	}

	renderString() {
		let writeString = '';

		if (!this._isInitiallyRendered) {
			this.renderPosition = getCursorPosition.sync();
			this._resize();
			this._isInitiallyRendered = true;
		}

		if (this._dirty) {
			this._resize();
			this._dirty = false;
			writeString += this.eraseString();
		}

		const numRowsToAllocate = this.renderPosition.row + this.height() - this.termSize.rows;

		if (numRowsToAllocate > 0) {
			writeString += ansiEscapes.cursorTo(0, this.termSize.rows);
			writeString += new Array(numRowsToAllocate + 1).join('\n');
			this.renderPosition.row -= numRowsToAllocate;
		}

		// if (this._dirty) {
		// 	this._calculateDimensions();

		// 	const numRowsToAllocate = (this.renderPosition.row + this.height()) - this.termSize.rows;

		// 	if (numRowsToAllocate > 0) {
		// 		writeString += ansiEscapes.cursorTo(0, this.termSize.rows);
		// 		writeString += new Array(numRowsToAllocate + 1).join('\n');
		// 		this.renderPosition.row -= numRowsToAllocate;
		// 	}
		// }

		for (let division of this.divisions) {
			const renderString = division.renderString();
			writeString += renderString;
		}

		writeString += this.jumpToString(this.bottomDivision(), 0, -1);
		writeString += ansiEscapes.cursorLeft;
		writeString += ansiEscapes.cursorDown();
		writeString += ansiEscapes.eraseDown;

		return writeString;
	}

	erase() {
		process.stdout.write(this.eraseString());
	}

	eraseString() {
		let writeString = '';

		// const [x, y] = [this.renderPosition.col - 1, this.renderPosition.row - 1];
		// writeString += ansiEscapes.cursorTo(x, y);
		// writeString += ansiEscapes.eraseDown;

		for (let division of this.divisions) {
			writeString += division.eraseString();
		}

		return writeString;
	}

	jumpTo(target, col = 0, row = 0) {
		const renderString = this.jumpToString(target, col, row);
		process.stdout.write(renderString);
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

		return division.scroll(scrollX, scrollY);
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

		return division.scrollUp(amount);
	}

	scrollDown(division, amount) {
		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		return division.scrollDown(amount);
	}

	_setDirty(division) {
		this._height = this._topDivision = this._bottomDivision = null;
		this._dirty = true;

		if (division) {
			const affectedDivisions = this._affectedDivisions[division.options.id];

			if (affectedDivisions) {
				affectedDivisions.forEach(division => division._resetDimensions());
			}
		}
	}

	_onResizeDebounced() {
		this._resize();
	}

	_resize() {
		this.termSize = termSize();

		if (this._isInitiallyRendered) {
			// erase everything on the screen
			this.chain(
				ansiEscapes.cursorTo(this.renderPosition.col - 1, this.renderPosition.row - 1),
				ansiEscapes.eraseDown
			);
		}

		this._setDirty();

		for (let division of this.divisions) {
			division._resize(this.termSize, this.renderPosition);
		}

		this._calculateDimensions();
		this._dirty = false;
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
		return this.divisions.sort((one, two) => one.top() < two.top())[0];
	}

	_getBottomDivision() {
		return this.divisions.sort((one, two) => {
			const onePos = one.top() + one.height();
			const twoPos = two.top() + two.height();
			return twoPos > onePos;
		})[0];
	}
}

module.exports = TerminalJumper
