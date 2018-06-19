const ansiEscapes = require('ansi-escapes')
const getCursorPosition = require('@patrickkettner/get-cursor-position')
const TextBlock = require('./text-block')

/**
 * TerminalJumper. Helps jumping the cursor to different parts of outputted
 * sections. Useful for clearing specific lines or updating text.
 * @class
 */
class TerminalJumper {
	constructor() {
		this.numBlocks = 0
		this.blocks = {}
		this.startPos = null
	}

	/**
	 * Gets a saved block of text.
	 *
	 * @param {string} id - The given id.
	 * @return {TextBlock}
	 */
	find(id) {
		return this.blocks[id]
	}

	/**
	 * Removes a single or multiple blocks of text.
	 *
	 * @param {string|TextBlock|array} block - The id, array of id's, text block, or array of text blocks to remove.
	 */
	remove(block) {
		if (typeof block === 'string') {
			delete this.blocks[block]
		} else if (block instanceof Array) {
			for (let id of block) {
				if (typeof id === 'string') {
					let id = Object.keys(this.blocks).find(id => this.blocks[id] === block)
				}
				delete this.blocks[id]
			}
		} else if (typeof block === 'object') {
			let id = Object.keys(this.blocks).find(id => this.blocks[id] === block)
			delete this.blocks[id]
		}
	}

	findAllMatching(regex) {
		let blocks = []
		let ids = Object.keys(this.blocks)

		for (let id of ids) {
			if (regex.test(id)) {
				blocks.push(this.blocks[id])
			}
		}

		return blocks
	}

	removeAllMatching(regex) {
		this.findAllMatching(regex).forEach(block => this.remove(block));
	}

	/**
	 * Saves a block of text to render by an id.
	 *
	 * @param {string} textString - The text to output.
	 * @param {string} [id] - The id to save this block to.
	 * @return {TextBlock}
	 */
	block(textString, id) {
		if (typeof id === 'undefined') {
			id = this._generateUniqueSectionId()
		}

		let block = new TextBlock(textString)
		this.blocks[id] = block
		this.numBlocks += 1

		return block
	}

	/**
	 * Creates a space between text blocks by simply creating an empty one.
	 */
	break() {
		this.block('')
	}

	/**
	 * Gets the first text block.
	 *
	 * @return {TextBlock}
	 */
	firstBlock() {
		let firstId = Object.keys(this.blocks)[0]
		return this.blocks[firstId]
	}

	/**
	 * Gets the last text block.
	 *
	 * @return {TextBlock}
	 */
	lastBlock() {
		let lastId = Object.keys(this.blocks)[this.numBlocks - 1]
		return this.blocks[lastId]
	}

	/**
	 * Gets the total height of all text blocks.
	 *
	 * @return {number}
	 */
	height() {
		let totalHeight = 0
		for (let block of Object.keys(this.blocks).map(id => this.blocks[id])) {
			totalHeight += block.height()
		}
		return totalHeight
	}

	/**
	 * Renders all blocks.
	 */
	render() {
		this.jumpTo(this.firstBlock() || this.topOfText);

		let allBlocks = Object.keys(this.blocks).map(id => this.blocks[id])

		let startPos = getCursorPosition.sync()
		let totalHeight = process.stdout.rows
		let scrollAmount = (startPos.row + this.height()) - totalHeight

		if (scrollAmount > 0) {
			process.stdout.write(ansiEscapes.cursorTo(0, process.stdout.rows));
			console.log(new Array(scrollAmount).join('\n'));
			process.stdout.write(ansiEscapes.cursorUp(this.height()));
		}

		allBlocks.forEach(block => block.render());
		process.stdout.write(ansiEscapes.eraseDown);

		this.topOfText = this.firstBlock()
	}

	/**
	 * Erases all output starting from a given block.
	 * @param {Textblock|string} block - The block to start erasing from (inclusively).
	 */
	erase(block) {
		if (typeof block === 'undefined') {
			block = this.firstBlock() || this.topOfText
		} else if (typeof block === 'string') {
			block = this.find(block)
		}

		this.jumpTo(block)
		process.stdout.write(ansiEscapes.eraseDown)
	}

	/**
	 * Jumps the cursor to a given section. By default the first row and column.
	 *
	 * @param {string|TextBlock} targetBlock - The block object or id we want to jump to.
	 * @param {integer} col - The col in this block we want to jump to.
	 * @param {integer} row - The row in this block we want to jump to.
	 * @return {TextBlock}
	 */
	jumpTo(targetBlock, col = 0, row = 0) {
		if (typeof targetBlock === 'string') {
			targetBlock = this.blocks[targetBlock]
			if (!targetBlock) {
				throw new Error('Not a section or valid section ID.')
			}
		}

		// ick -- only jump to the block if it has a position (if it's been printed)
		if (!targetBlock.position) {
			return
		}

		let x = targetBlock.position.col - 1
		let y = targetBlock.position.row - 1
		process.stdout.write(ansiEscapes.cursorTo(x, y))

		targetBlock.jumpTo(col, row)

		return targetBlock
	}

	/**
	 * Moves the cursor to a global position.
	 *
	 * @param {object} col - An object in the form of { col, row }.
	 * @param {integer} col - An integer of the target column.
	 * @param {integer} row - An integer of the target row.
	 * @return {null}
	 */
	cursorTo(col = 0, row = 0) {
		let x
		let y

		if (typeof col === 'object') {
			x = col.col
			y = col.row
		} else if (typeof col === 'number') {
			x = col
			y = row
		}
		process.stdout.write(ansiEscapes.cursorTo(x - 1, y - 1))
	}

	/**
	 * Erases all text and deletes all text blocks.
	 */
	reset() {
		this.erase()
		this.renderedInitial = false
		this.blocks = {}
		this.numBlocks = 0
	}

	/**
	 * Generates a unique id to save a block to.
	 *
	 * @return {string}
	 */
	_generateUniqueSectionId() {
		return `block${this.numBlocks}`
	}
}

module.exports = new TerminalJumper()
