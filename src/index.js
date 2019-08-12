const debounce = require('lodash.debounce');
const termSize = require('term-size');
const chalk = require('chalk');
const ansiEscapes = require('ansi-escapes');
const getCursorPosition = require('get-cursor-position');
const Graph = require('./Graph'); // TODO: rename
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
		this.graph = new Graph();

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

		this.graph.setDirty(division);

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
		this.graph.setDivisions(this.divisions);
		this.graph.calculateGraph();
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
			this._setupDebugDivision();
		}

		const dirtyNodes = Array.from(this.graph.dirtyNodes.values());
		const needsRenderNodes = Array.from(this.graph.needsRenderNodes.values());

		for (const { division } of dirtyNodes) {
			division._calculateDimensions(true);
		}

		const numRowsToAllocate = this.renderPosition.row + height - this.termSize.rows - 1;
		if (numRowsToAllocate > 0) {
			writeString += ansiEscapes.cursorTo(0, this.termSize.rows);
			writeString += new Array(numRowsToAllocate + 1).join('\n');
			this.renderPosition.row -= numRowsToAllocate;
		}

		[...dirtyNodes, ...needsRenderNodes].sort((a, b) => {
			return a.division.options.renderOrder - b.division.options.renderOrder;
		}).forEach(node => writeString += node.division.renderString());

		this.graph.clear();

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
		this.graph.destroy();

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
			this.graph.setDirty(div);
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
			right: 0,
			renderOrder: 100
		}, options);

		this._debugDivisionId = options.id;
		this.addDivision(options);

		const debugDivision = this.getDivision(this._debugDivisionId);

		debugDivision.addBlock(`${chalk.bold.red('● re-calculated & re-rendered')}`, 'legend-red');
		debugDivision.addBlock(`${chalk.bold.yellow('● re-rendered')}`, 'legend-yellow');
		debugDivision.addBlock(`${chalk.bold.white('● no change')}`, 'legend-white');
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

		const addBlock = (array, text, color) => {
			array.push(chalk[color || 'white'](text));
		};

		for (const [id, node] of this.graph.nodes.entries()) {
			if (this.graph.dirtyNodes.has(node.division.options.id)) {
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
				const isNeedsRender = this.graph.needsRenderNodes.has(id);
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
}

module.exports = TerminalJumper;
