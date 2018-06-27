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
 * @class
 */
class TerminalJumper {
	constructor(options = {}) {
		this.options = Object.assign({}, DEFAULT_OPTIONS, options);

		this._onResizeDebounced = debounce(this._onResizeDebounced.bind(this), 200);

		this._isInitiallyRendered = false;
		this._dirty = true;
		this._uniqueIdCounter = 0;

		this.divisionsHash = {};
		this.divisions = this.options.divisions.map(options => {
			const id = options.id || `division-${this._uniqueIdCounter++}`;
			const division = new Division(options);
			this.divisionsHash[id] = division;
			return division;
		});

		this.termSize = { rows: null, columns: null };

		process.stdout.on('resize', this._onResizeDebounced);
	}

	getDivision(id) {
		const division =  this.divisionsHash[id];

		if (!division) {
			throw new Error(`Could not find division "${divisionId}".`);
		}

		return division;
	}

	block(string, division, options = {}) {
		if (!division) {
			division = this.divisions[0];
		} else if (typeof division === 'string') {
			division = this.divisionsHash[division];
			if (!division) {
				throw new Error(`No division found with id "${divisionId}"`);
			}
		}

		this._dirty = true;

		return division.block(string, options);
	}

	height(division) {
		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		if (this._dirty) {
			this._calculateDimensions();
			this._dirty = false;
		}

		if (division) {
			return this.getDivision(divisionId).height();
		} else {
			return this._height;
		}
	}

	render() {
		let writeString = '';

		if (!this._isInitiallyRendered) {
			this._resize();
			this.renderPosition = getCursorPosition.sync();
			this._isInitiallyRendered = true;
		}

		if (this._dirty) {
			this._calculateDimensions();
			this._dirty = false;

			const numRowsToAllocate = (this.renderPosition.row + this.height()) - this.termSize.rows;

			if (numRowsToAllocate > 0) {
				writeString += ansiEscapes.cursorTo(0, this.termSize.rows);
				writeString += new Array(numRowsToAllocate + 1).join('\n');

				this.renderPosition.row -= numRowsToAllocate;
			}
		}

		for (let division of this.divisions) {
			const renderString = division._render(this.renderPosition);
			writeString += renderString;
		}

		writeString += this._getJumpToString(this._bottomDivision, 0, -1);
		writeString += ansiEscapes.cursorLeft;
		writeString += ansiEscapes.cursorDown();
		writeString += ansiEscapes.eraseDown;

		process.stdout.write(writeString);
	}

	jumpTo(target, col = 0, row = 0) {
		const renderString = this._getJumpToString(target, col, row);
		process.stdout.write(renderString);
	}

	scroll(division, scrollX, scrollY, options = {}) {
		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		division.scroll(scrollX, scrollY);

		if (!options.noRender) {
			// possibly don't need to call this.render()
			let renderString = division._render(this.renderPosition);
			renderString += this._getJumpToString(this._bottomDivision, 0, -1);
			renderString += ansiEscapes.cursorLeft;
			renderString += ansiEscapes.cursorDown();
			process.stdout.write(renderString);
		}
	}

	scrollX(division, scrollX, options) {
		this.scroll(division, scrollX, null, options);
	}

	scrollY(division, scrollY, options) {
		this.scroll(division, null, scrollY, options);
	}

	_onResizeDebounced() {
		this._resize();
	}

	_resize() {
		this.termSize = termSize();

		for (let division of this.divisions) {
			division._resize(this.termSize);
		}

		for (let division of this.divisions) {
			this._setDivisionPosition(division);
		}

		this._dirty = true;
	}

	_setDivisionPosition(division) {
		division.top = this._calculateDivisionPositionForProp(division, 'top');
		division.left = this._calculateDivisionPositionForProp(division, 'left');
		division.width = ~~(division.options.width * this.termSize.columns);
	}

	/**
	 * @param {Division} division - the division.
	 * @param {string} position - "top|left".
	 */
	_calculateDivisionPositionForProp(division, position) {
		if (typeof division.options[position] === 'number') {
			const num = this.termSize[(position === 'left') ? 'columns' : 'rows'];
			return ~~(division.options[position] * num);
		} else if (typeof division.options[position] === 'string') {
			const targetDivision = this.getDivision(division.options.top);
			const targetTop = this._calculateDivisionPositionForProp(targetDivision, position);
			return targetTop + targetDivision.height();
		}
	}

	/**
	 * A hodge-podge of various attempts at performance optimization.
	 */
	_calculateDimensions() {
		// get the total height
		const heights = this.divisions.map(division => {
			return division.height(this.termSize) + division.top;
		});
		this._height = Math.max(...heights);

		// get the "bottom" division
		this._bottomDivision = this._getBottomDivision();
	}

	_getTopDivision() {
		return this._divisions.sort((one, two) => one.top < two.top)[0];
	}

	_getBottomDivision() {
		return this.divisions.sort((one, two) => {
			const onePos = one.top + one.height();
			const twoPos = two.top + two.height();
			return twoPos > onePos;
		})[0];
	}

	_getJumpToString(target, col, row) {
		if (!this._isInitiallyRendered) {
			return '';
		}

		let division = target;
		let blockId;

		if (typeof target === 'string') {
			[division, blockId] = target.split('.');

			division = this.getDivision(division);
		}

		const pos = division._getJumpPos(blockId, col, row);
		const [x, y] = [this.renderPosition.col + pos.col - 1, this.renderPosition.row + pos.row - 1];

		return ansiEscapes.cursorTo(x, y);
	}
}

module.exports = TerminalJumper
