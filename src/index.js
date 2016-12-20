const ansiEscapes = require('ansi-escapes')
const getCursorPosition = require('get-cursor-position')
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

	removeAllMatching(regex) {
		let ids = Object.keys(this.blocks)
		for (let id of ids) {
			if (regex.test(id)) {
				this.remove(id)
			}
		}
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
	 * Erases all output, then renders each text block. When a text block's
	 * `render` method is called, the text block saves it's cursor position.
	 * But since the terminal may scroll down to show output, each position needs
	 * to be updated. Once all blocks are rendered, update each with their correct
	 * position.
	 */
	render() {
		this.erase()

		// Record the cursor position. If the terminal needs to scroll up to display
		// all the text, each text block's position needs to be updated.
		let startPos = getCursorPosition.sync()

		let allBlocks = Object.keys(this.blocks).map(id => this.blocks[id])
		for (let block of allBlocks) {
			block.render()
		}

		for (let block of allBlocks) {
			// getCursorPosition.sync isn't synchronous. If `render` is called too
			// fast, startPos is undefined and throws an error. For now, ignore it.
			if (!startPos) {
				continue
			}

			let totalHeight = process.stdout.rows
			let leftover = (startPos.row + this.height()) - totalHeight

			if (leftover > 0) {
				block.updatePositionOffset(leftover)
			}
		}

		this.topOfText = this.firstBlock()
	}

	/**
	 * Erases all output.
	 */
	erase() {
		let firstBlock = this.firstBlock() || this.topOfText
		// ick -- only jump to the block if it has a position (if it's been printed)
		if (firstBlock.position) {
			this.jumpTo(firstBlock)
			process.stdout.write(ansiEscapes.eraseDown)
		}
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
				throw 'Not a section or valid section ID.'
			}
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
