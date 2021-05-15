const { spawnSync } = require('child_process');
const debounce = require('lodash.debounce');
const termSize = require('term-size');
const chalk = require('chalk');
const ansiEscapes = require('ansi-escapes');
const evaluator = require('./evaluator');
const Graph = require('./Graph');
const Division = require('./Division');
const TextBlock = require('./TextBlock');
const renderInjects = require('./render-injects');

const DEFAULT_DIVISION_OPTIONS = {
	id: 'default-division',
	top: 0,
	left: 0,
	width: '100%'
};

const DEFAULT_OPTIONS = {
	/**
	 * @type {array<object>|string}
	 *
	 * An array of division options. If a string 'default' is given, a division
	 * is automatically added using the default options.
	 */
	divisions: [],

	useAlternateScreen: true,

	bracketsParser: null,

	/**
	 * Debug mode -- on every render, lists each division's id and colors it to
	 * show if it has been recalculated, re-rendered, etc.
	 *
	 * Can either be a boolean or the debug division's options.
	 *
	 * @type {boolean|object}
	 */
	debug: false
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

		this.renderPosition = null; // top left corner of the program
		this._isChaining = false; // is writing to a string, or stdout directly?
		this._chain = ''; // internal string, to be written to stdout
		this._uniqueIdCounter = 0; // counter for unique division id
		this._debugDivisionId = 'debug'; // id for debug division

		this.termSize = this.getTermSize();

		this.divisionsHash = {};
		this.divisions = [];

		this.graph = new Graph(this);
		this.renderInjects = renderInjects;

		if (this.options.divisions === 'default') {
			this.addDivision(DEFAULT_DIVISION_OPTIONS);
		} else {
			this.addDivision(this.options.divisions);
		}

		if (this.options.debug) {
			this._addDebugDivision(this.options.debug);
		}

		process.stdout.on('resize', this._onResizeDebounced);
	}

	/**
	 * @param {array<Division|object>|Division|object} division - Either a
	 * Division object or a divisions options object.
	 * @return {Division} - a Division instance.
	 */
	addDivision(division, calculate = true) {
		this.renderInjects.set('before:erase-all', this.eraseString());

		if (Array.isArray(division)) {
			division.forEach(division => this.addDivision(division, false));
			this.calculateGraph();
			this.setDirty();
			return;
		}

		if (!(division instanceof Division)) {
			division = new Division(division);
		}

		division.jumper = this;
		division.termSize = this.termSize;
		division.renderPosition = this.renderPosition;

		const id = division.options.id || `division-${this._uniqueIdCounter++}`;
		this.divisionsHash[id] = division;
		this.divisions.push(division);

		if (calculate) {
			this.calculateGraph();
			this.setDirty();
		}

		return division;
	}

	getDivision(id) {
		const division = this.divisionsHash[id];

		if (!division) {
			throw new Error(`Could not find division "${id}".`);
		}

		return division;
	}

	hasDivision(id) {
		return !!this.divisionsHash[id];
	}

	removeDivision(division, calculate = true) {
		this.renderInjects.set('before:erase-all', this.eraseString());

		if (Array.isArray(division)) {
			division.forEach(division => this.removeDivision(division, false));
			this.calculateGraph();
			this.setDirty();
			return;
		}

		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		delete this.divisionsHash[division.options.id];
		this.divisions.splice(this.divisions.indexOf(division), 1);

		if (calculate) {
			this.calculateGraph();
			this.setDirty();
		}
	}

	reset() {
		this.removeDivision(this.divisions.slice());
		this.addDivision(DEFAULT_OPTIONS.divisions[0]);
	}

	addBlock(targets, text, idx) {
		let division, blockId;

		if (typeof targets === 'string') {
			const ids = targets.split('.');
			blockId = ids[1];

			division = this.getDivision(ids[0]);

			if (!division) {
				this.divisions.length === 0 && this.addDivision(DEFAULT_DIVISION_OPTIONS);
				division = this.divisions[0];
				blockId = text;
				text = targets;
			}
		}

		return division.addBlock(text, blockId, idx);
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

	getBlock(targets) {
		const [divisionId, blockId] = targets.split('.');

		if (!divisionId) {
			throw new Error('Division id must be specified.');
		}

		if (!blockId) {
			throw new Error('Block id must be specified.');
		}

		return this.getDivision(divisionId).getBlock(blockId);
	}

	removeBlock(targets) {
		const [divisionId, blockId] = targets.split('.');

		if (!divisionId) {
			throw new Error('Division id must be specified.');
		}

		if (!blockId) {
			throw new Error('Block id must be specified.');
		}

		return this.getDivision(divisionId).removeBlock(blockId);
	}

	width(division) {
		if (division) {
			if (typeof division === 'string') division = this.getDivision(division);
			return division.width();
		}

		return this.termSize.columns;
	}

	height(division) {
		if (division) {
			if (typeof division === 'string') division = this.getDivision(division);
			return division.height();
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
		this._isChaining = true;
		return this;
	}

	appendToChain(string) {
		this._chain += string;
		return this;
	}

	execute() {
		this._isChaining = false;

		process.stdout.write(this._chain);
		this._chain = '';

		return this;
	}

	calculateGraph() {
		this.graph.setDivisions(this.divisions);
		this.graph.calculateGraph();
	}

	evaluate(expression, fnOrObj) {
		if (typeof expression === 'number') {
			return ~~(expression);
		}

		if (!fnOrObj) {
			fnOrObj = (num, unit) => {
				if (unit === '%w') {
					return this.width() * num / 100;
				} else if (unit === '%h') {
					return this.height() * num / 100;
				}

				throw new Error(`Unrecognized unit "${unit}" found in expression "${expression}".`);
			};
		}

		const replaced = this.replaceBrackets(expression, (insides, after) => {
			if (this.hasDivision(insides)) {
				if (!after) {
					throw new Error(`Do not know how to use division "${insides}" in expression "${expression}" (missing property name after curly braces).`);
				}

				const div = this.getDivision(insides);

				if (after === 't' || after === 'top') return div.top();
				if (after === 'l' || after === 'left') return div.left();
				if (after === 'w' || after === 'width') return div.width();
				if (after === 'h' || after === 'height') return div.height();
				if (after === 'b' || after === 'bottom') return div.bottom();
				if (after === 'r' || after === 'right') return div.right();
				if (after === 'cw' || after === 'content-width') return div.contentWidth();
				if (after === 'ch' || after === 'content-height') return div.contentHeight();
				if (after === 'nw' || after === 'natural-width') return div.naturalWidth();
				if (after === 'nh' || after === 'natural-height') return div.naturalHeight();

				throw new Error(`Unknown property "${after}".`);
			} else if (this.options.bracketsParser) {
				const parsed = this.options.bracketsParser(insides, after);
				if (!parsed) {
					throw new Error(`Must return a value from parsed brackets expression "{${insides}}${after}".`);
				}
				return parsed;
			} else {
				throw new Error(`Unknown brackets expression: "{${insides}}${after}".`)
			}
		});

		return ~~(evaluator.evaluate(replaced, fnOrObj));
	}

	/**
	 * Given an expression and callback, captures anything inside of and
	 * immediately after curly braces. Replaces it with the return value of the
	 * callback, which is called given the found values inside and after the
	 * curly braces. Runs until there are no more brackets in the expression.
	 *
	 * @param {expression} string - The expression string.
	 * @param {function} cb - The callback function, called with the captured
	 * chars from the regular expression.
	 * @return {string}
	 */
	replaceBrackets(expression, cb) {
		const reg = /\{([^\{\}]*)\}([\w]*)(?=[^\w]|$)/;
		let exp = expression;
		let match;

		while (match = reg.exec(exp)) {
			exp = exp.replace(reg, cb(match[1], match[2]));
		}

		return exp;
	}

	init() {
		if (this.options.useAlternateScreen) {
			this.smcup();
		}

		this.renderPosition = { row: 0, col: 0 };
		this._resize();
	}

	smcup() {
		spawnSync('tput smcup', { shell: true, stdio: 'inherit' });
	}

	rmcup() {
		spawnSync('tput rmcup', { shell: true, stdio: 'inherit' });
	}

	render() {
		const str = this.renderString();
		this._isChaining ? this._chain += str : process.stdout.write(str);

		return this;
	}

	renderString() {
		let startTime;

		if (this.options.debug) {
			this._setupDebugDivision();
			startTime = process.hrtime();
		}

		this.graph.calculateDirtyNodes();

		let writeString = this.renderInjects.inject(/^before:/);

		const height = this.height();

		const numRowsToAllocate = this.renderPosition.row + height - this.termSize.rows;
		if (numRowsToAllocate > 0) {
			writeString += ansiEscapes.cursorTo(0, this.termSize.rows);
			writeString += new Array(numRowsToAllocate + 1).join('\n');
			this.renderPosition.row -= numRowsToAllocate;
		}

		this.graph.getNeedsRenderNodes().sort((a, b) => {
			return a.division.options.renderOrder - b.division.options.renderOrder;
		}).forEach((node, idx) => writeString += node.division.renderString());

		writeString += this.renderInjects.inject(/^after:/);

		if (this.options.debug) {
			const hrtime = process.hrtime(startTime);
			this._debugRenderInfo({ writeString, hrtime });
		}

		this.graph.clean();

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
			this.graph.setNeedsRender(division);
		}

		return writeString;
	}

	fillRect(...args) {
		const str = this.fillRectString(...args);
		this._isChaining ? this._chain += str : process.stdout.write(str);
		return this;
	}

	fillRectString(x, y, width, height, char = ' ') {
		width = this.evaluate(width);
		height = this.evaluate(height);

		const line = new Array(width).fill(char).join('');
		const lines = new Array(height).fill(line);

		return [
			this.jumpToString(x, y) +
			lines.join(ansiEscapes.cursorMove(-width, 1))
		].join('');
	}

	jumpTo(colExp, rowExp) {
		const str = this.jumpToString(colExp, rowExp);
		this._isChaining ? this._chain += str : process.stdout.write(str);
		return this;
	}

	jumpToString(colExp, rowExp) {
		return ansiEscapes.cursorTo(
			this.evaluate(colExp, { '%': this.width() }),
			this.evaluate(rowExp, { '%': this.getAvailableHeight() })
		);
	}

	jumpToBlock(targets, col = 0, row = 0) {
		const str = this.jumpToBlockString(targets, col, row);
		this._isChaining ? this._chain += str : process.stdout.write(str);
		return this;
	}

	jumpToBlockString(targets, col = 0, row = 0) {
		if (typeof targets !== 'string') {
			throw new Error(`Must specify division and block ids, separated by a period (received: "${targets}").`);
		}

		const [divId, blockId] = targets.split('.');
		return this.getDivision(divId).jumpToBlockString(blockId, col, row);
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
		return termSize();
	}

	getAvailableHeight() {
		return this.termSize.rows;
	}

	destroy() {
		this.graph.destroy();

		for (let division of this.divisions) {
			division.destroy();
		}

		this.renderInjects.remove(/^before:/);
		this.renderInjects.remove(/^after:/);

		this.options = this.renderInjects = null;
		this._isChaining = this._chain = null;
		this._uniqueIdCounter = this._debugDivisionId = null;
		this.divisions = this.divisionsHash = null;
		this.termSize = this.renderPosition = null;

		process.stdout.removeListener('resize', this._onResizeDebounced);
	}

	setDirty(division) {
		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		this._height = null;
		this.graph.setDirty(division);
	}

	setNeedsRender(division) {
		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		this.graph.setNeedsRender(division);
	}

	_onResizeDebounced() {
		this._resize();
		this.render();
	}

	_resize() {
		this.termSize = this.getTermSize();

		// erase everything on the screen
		process.stdout.write(
			ansiEscapes.cursorTo(0, 0) +
			ansiEscapes.eraseDown
		);

		for (const division of this.divisions) {
			division._resize(this.termSize, this.renderPosition);
		}

		this.setDirty();
	}

	_calculateHeight() {
		let height = 0;

		for (const div of this.divisions) {
			const divHeight = div.top() + div.height();
			if (divHeight > height) {
				height = divHeight;
			}
		}

		return height;
	}

	_addDebugDivision(options) {
		if (typeof options !== 'object') {
			options = {};
		}

		options = Object.assign({}, {
			id: this._debugDivisionId,
			width: '40%',
			top: `100% - {${this._debugDivisionId}}height`,
			left: `100% - {${this._debugDivisionId}}width`,
			renderOrder: 999
		}, options);

		this._debugDivisionId = options.id;
		this.addDivision(options);

		const debugDivision = this.getDivision(this._debugDivisionId);

		debugDivision.addBlock(`${chalk.bold.red('● re-calculated & re-rendered')}`, 'legend-red');
		debugDivision.addBlock(`${chalk.bold.yellow('● re-rendered')}`, 'legend-yellow');
		debugDivision.addBlock(`${chalk.bold.white('● no change')}`, 'legend-white');
		debugDivision.addBlock(``, 'render-string-length');
		debugDivision.addBlock(``, 'hrtime');
		debugDivision.addBlock(new Array(debugDivision.width()).join('='), 'divider');
	}

	_setupDebugDivision() {
		const debugDiv = this.getDivision(this._debugDivisionId);

		for (let i = 0, l = debugDiv.blockIds.length; i < l; i++) {
			if (debugDiv.hasBlock(`div-block-${i}`)) {
				debugDiv.removeBlock(`div-block-${i}`);
			} else {
				break;
			}
		}

		const processed = {};
		const dirtyBlocks = [];
		const needsRenderBlocks = [];
		const remainingBlocks = [];

		const checkIfProcessed = (node) => {
			if (processed[node.division.options.id] || node.division === debugDiv) {
				return true;
			}

			processed[node.division.options.id] = true;
			return false;
		};

		const addBlock = (array, text, color = 'white') => {
			array.push(chalk[color](text));
		};

		for (const [id, node] of this.graph.nodes.entries()) {
			if (node.status === 2) {
				this.graph.traverse(node, (child, { depth }) => {
					if (checkIfProcessed(child)) return;

					let text = child.division.options.id;
					if (child.depth) {
						text = (new Array(child.depth)).fill(' ').join('') + '↳' + text;
					}

					addBlock(dirtyBlocks, text, 'red');
				});
			} else {
				if (checkIfProcessed(node)) continue;

				const { id } = node.division.options;
				const isNeedsRender = node.status === 1;
				const array = isNeedsRender ? needsRenderBlocks : remainingBlocks;
				const color = isNeedsRender ? 'yellow' : 'white';

				addBlock(array, id, color);
			}
		}

		const allBlocks = dirtyBlocks.concat(needsRenderBlocks, remainingBlocks);

		for (const [idx, block] of allBlocks.entries()) {
			debugDiv.addBlock(block, `div-block-${idx}`);
		}
	}

	_debugRenderInfo({ writeString, hrtime }) {
		const div = this.getDivision(this._debugDivisionId);
		div.getBlock('render-string-length').content(`render string length: ${writeString.length}`);
		div.getBlock('hrtime').content(`total time: ${hrtime[0] + hrtime[1] / 1000000000}s`);
	}
}

module.exports = TerminalJumper;
