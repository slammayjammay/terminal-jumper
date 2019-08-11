const debounce = require('lodash.debounce');
const termSize = require('term-size');
const chalk = require('chalk');
const ansiEscapes = require('ansi-escapes');
const getCursorPosition = require('get-cursor-position');
const Tree = require('./Tree'); // TODO: rename
const Division = require('./Division');
const TextBlock = require('./TextBlock');

const DEFAULT_OPTIONS = {
	/**
	 * Defaults to one full-width division.
	 * TODO: do not add this on instantiation.
	 */
	divisions: [{
		id: 'default-division',
		top: 0,
		left: 0,
		width: '100%'
	}],

	/**
	 * If true, caps the max height of TerminalJumper to the number of rows minus
	 * one. The purpose of this is to show the command that prompted the program.
	 * Set to false if TerminalJumper should cap the max height to the full number
	 * of rows.
	 *
	 * @type {boolean}
	 */
	leaveTopRowAvailable: true,

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
		this.isInitiallyRendered = false; // have we rendered once already?
		this._isChaining = false; // is writing to a string, or stdout directly?
		this._chain = ''; // internal string, to be written to stdout
		this._uniqueIdCounter = 0; // counter for unique division id
		this._debugDivisionId = 'debug'; // id for debug division

		this.termSize = this.getTermSize();

		this.divisionsHash = {};
		this.divisions = [];

		this.forNextRender = new Map();
		this.tree = new Tree();

		this.addDivision(this.options.divisions);

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
	addDivision(division) {
		if (Array.isArray(division)) {
			division.forEach(division => this.addDivision(division));
			this.calculateGraph();
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

		this.calculateGraph();
		this.setDirty(division);

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

	removeDivision(division) {
		if (Array.isArray(division)) {
			division.forEach(division => this.removeDivision(division));
			this.calculateGraph();
			return;
		}

		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		this.tree.setDirty(division);

		delete this.divisionsHash[division.options.id];
		this.divisions.splice(this.divisions.indexOf(division), 1);

		this.calculateGraph();

		this.setDirty();
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

			if (!division && this.divisions[0].options.id === 'default-division') {
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
		this.tree.setDivisions(this.divisions);
		this.tree.calculateGraph();
	}

	_setupInitialRender() {
		// get the cursor position. we only care about which row the cursor is on
		this.renderPosition = this._getCursorPosition();
		this.renderPosition.col = 1;
		this.isInitiallyRendered = true;
		this._resize();
	}

	render() {
		if (!this.isInitiallyRendered) {
			this._setupInitialRender();
		}

		const str = this.renderString();
		this._isChaining ? this._chain += str : process.stdout.write(str);

		return this;
	}

	renderString() {
		if (!this.isInitiallyRendered) {
			this._setupInitialRender();
		}

		let writeString = '';

		for (const val of this.forNextRender.values()) {
			writeString += (typeof val === 'function') ? (val() || '') : val;
		}
		this.forNextRender.clear();

		// set full height divs
		const height = this.height();
		this._setFullHeightDivs(height);

		if (this.options.debug) {
			this._renderDebugDivision({ dirtyNodes, needsRenderNodes });
		}

		for (const { division } of this.tree.dirtyNodes.values()) {
			division._calculateDimensions(true);
		}

		const numRowsToAllocate = this.renderPosition.row + height - this.termSize.rows - 1;
		if (numRowsToAllocate > 0) {
			writeString += ansiEscapes.cursorTo(0, this.termSize.rows);
			writeString += new Array(numRowsToAllocate + 1).join('\n');
			this.renderPosition.row -= numRowsToAllocate;
		}

		Array.from(this.tree.needsRenderNodes.values()).sort((a, b) => {
			return a.division.options.renderOrder - b.division.options.renderOrder;
		}).forEach(node => writeString += node.division.renderString());

		this.tree.dirtyNodes.clear();
		this.tree.needsRenderNodes.clear();

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

		const [x, y] = [this.renderPosition.col - 1, this.renderPosition.row - 1];
		writeString += ansiEscapes.cursorTo(x, y);

		return writeString;
	}

	jumpTo(target, col = 0, row = 0) {
		const str = this.jumpToString(target, col, row);
		this._isChaining ? this._chain += str : process.stdout.write(str);
		return this;
	}

	jumpToString(target, col = 0, row = 0) {
		if (!this.isInitiallyRendered) {
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
		return termSize();
	}

	getAvailableHeight() {
		return this.termSize.rows - (this.options.leaveTopRowAvailable ? 1 : 0);
	}

	destroy() {
		this.tree.destroy();

		for (let division of this.divisions) {
			division.destroy();
		}

		this.divisions = this.divisionsHash = null;
		this.termSize = this.renderPosition = null;

		process.stdout.removeListener('resize', this._onResizeDebounced);
	}

	/**
	 * Wrapper for `get-cursor-position`. It appears that if stdin is written to
	 * before getting the cursor position, it doesn't work properly. A subsequent
	 * call to it will work, however.
	 * This only needs to be called once, for the initial render. Afterward we
	 * can deduce the cursor position based on division/block dimensions.
	 */
	_getCursorPosition() {
		let pos;

		while (!pos) {
			pos = getCursorPosition.sync();
		}

		return pos;
	}

	setDirty(division) {
		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		this._height = null;
		this.tree.setDirty(division);
	}

	setNeedsRender(division) {
		if (typeof division === 'string') {
			division = this.getDivision(division);
		}

		this.tree.setNeedsRender(division);
	}

	_onResizeDebounced() {
		this._resize();
		this.render();
	}

	_resize() {
		this.termSize = this.getTermSize();

		if (this.isInitiallyRendered) {
			// erase everything on the screen
			process.stdout.write(
				ansiEscapes.cursorTo(this.renderPosition.col - 1, this.renderPosition.row - 1) +
				ansiEscapes.eraseDown
			);
		}

		for (const division of this.divisions) {
			division._resize(this.termSize, this.renderPosition);
		}

		this.setDirty();
	}

	_calculateHeight() {
		let height = 0;

		const divsWithSetHeight = this.divisions.filter(div => {
			return div.options.height !== 'full';
		});

		for (const div of divsWithSetHeight) {
			const divHeight = div.top() + div.height();
			if (divHeight > height) {
				height = divHeight;
			}
		}

		return height;
	}

	_setFullHeightDivs(height) {
		for (const div of this.divisions.filter(div => div.options.height === 'full')) {
			div._setHeight(height - div.top());
			this.tree.setDirty(div);
		}
	}

	_addDebugDivision(options) {
		if (typeof options !== 'object') {
			options = {};
		}

		options = Object.assign({}, {
			id: this._debugDivisionId,
			width: '40%',
			bottom: 0,
			right: 0
		}, options);

		const divisionsToMonitor = this.divisions.slice();

		this._debugDivisionId = options.id;
		this.addDivision(options);

		const debugDivision = this.getDivision(this._debugDivisionId);

		debugDivision.addBlock(`${chalk.bold.red('● re-calculated & re-rendered')}`, 'legend-red');
		debugDivision.addBlock(`${chalk.bold.yellow('● re-rendered')}`, 'legend-yellow');
		debugDivision.addBlock(`${chalk.bold.white('● no change')}`, 'legend-white');
		debugDivision.addBlock(new Array(debugDivision.width()).join('='), 'divider');
	}

	/**
	 * Parameters are optional -- if given, they avoid recalculations.
	 * Legend:
	 * RED -- division was recalculated and re-rendered.
	 * YELLOW -- division was re-rendered.
	 * WHITE -- division was neither re-calculated nor re-rendered.
	 *
	 * @param {object}
	 * @prop {array} [allNodes] - All nodes in the tree.
	 * @prop {array} [dirtyNodes] - All dirty nodes in the tree.
	 * @prop {array} [needsRenderNodes] - All nodes that need rendering in the tree.
	 */
	_renderDebugDivision({ dirtyNodes, needsRenderNodes, allNodes }) {
		if (!dirtyNodes) dirtyNodes = this.tree.dirtyNodes();
		if (!needsRenderNodes) needsRenderNodes = this.tree.needsRenderNodes();
		if (!allNodes) allNodes = this.tree.allNodes();

		const debugDivision = this.getDivision(this._debugDivisionId);
		needsRenderNodes.push({ division: debugDivision }); // fake a node

		// flash the divider green whenever this method is called (whenever #render
		// is called)
		this._flashDivider();

		// iterate through all division ids and color them correctly
		const processed = { [debugDivision.options.id]: true };

		const map = [
			[dirtyNodes, 'red'],
			[needsRenderNodes, 'yellow'],
			[allNodes, 'white']
		];

		for (let [nodeTypes, color] of map) {
			let startNode; // correct spacing when showing dirty node hierarchy

			for (let node of nodeTypes) {
				if (processed[node.division.options.id]) {
					continue;
				}
				processed[node.division.options.id] = true;
				startNode = startNode || node;

				const targets = `${this._debugDivisionId}.${node.division.options.id}`;

				if (this.hasBlock(targets)) {
					this.getBlock(targets).remove();
				}

				const spacing = new Array(node.depth - startNode.depth + 1).join(' ');
				const str = `${spacing}${spacing ? '↳' : ''}${node.division.options.id}`;
				const text = chalk[color](str);
				this.addBlock(targets, text);
			}
		}
	}

	_flashDivider() {
		const divider = this.getBlock(`${this._debugDivisionId}.divider`);

		// set green
		divider.content(chalk.green(divider.escapedText));

		// return to white
		setTimeout(() => {
			divider.content(divider.escapedText);

			process.stdout.write(
				ansiEscapes.cursorSavePosition +
				this.getDivision(this._debugDivisionId).renderString() +
				ansiEscapes.cursorRestorePosition
			);
		}, 400);
	}
}

module.exports = TerminalJumper;
