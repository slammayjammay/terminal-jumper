const ansiEscapes = require('ansi-escapes')
const getCursorPosition = require('get-cursor-position')
const TextBlock = require('./text-block')

/**
 * Gymnast. Helps jumping the cursor to different parts of outputted sections.
 * Useful for clearing specific lines or updating text.
 */
class Gymnast {
	constructor() {
		this.numBlocks = 0
		this.blocks = {}
		this.startPos = null
	}

	find(id) {
		return this.blocks[id]
	}

	/**
	 * @param {string|TextBlock|array} block - The id, array of id's, or text block object to remove.
	 */
	remove(block) {
		if (typeof block === 'string') {
			delete this.blocks[block]
		} else if (block instanceof Array) {
			for (let id of block) {
				delete this.blocks[id]
			}
		} else if (typeof block === 'object') {
			let id = Object.keys(this.blocks).find(id => this.blocks[id] === block)
			delete this.blocks[id]
		}
	}

	/**
	 * Outputs the given text and adds a newline to separate this section from
	 * other text.
	 *
	 * @param {string} textString - The text.
	 * @param {string} [id] - The id to save this block to.
	 */
	block(textString, id) {
		if (typeof id === 'undefined') {
			id = this.generateUniqueSectionId()
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

	generateUniqueSectionId() {
		return `block${this.numBlocks}`
	}

	firstBlock() {
		let firstId = Object.keys(this.blocks)[0]
		return this.blocks[firstId]
	}

	lastBlock() {
		let lastId = Object.keys(this.blocks)[this.numBlocks - 1]
		return this.blocks[lastId]
	}

	height() {
		let totalHeight = 0
		for (let block of Object.keys(this.blocks).map(id => this.blocks[id])) {
			totalHeight += block.height()
		}
		return totalHeight
	}

	/**
	 * Erase everything, then render each section. When a section renders, it
	 * counts the number of times the screen scrolls when its text is printed.
	 * Once all sections are rendered, call each section to update its internal
	 * position with the offset count.
	 *
	 * @param {TextBlock} textBlock - The textBlock to begin rendering.
	 */
	render(textBlock = this.firstBlock()) {
		if (this.renderedInitial) {
			this.erase(textBlock)
		} else {
			this.renderedInitial = true
		}

		// Record the cursor position. If the terminal needs to scroll up to display
		// all the text, we need to update the position of each text block.
		let startPos = getCursorPosition.sync().row
		let totalHeight = process.stdout.rows
		let leftover = (startPos + this.height()) - totalHeight

		let allBlocks = Object.keys(this.blocks).map(id => this.blocks[id])
		let renderBlocks = allBlocks.slice(allBlocks.indexOf(textBlock))

		// first render each block
		for (let block of renderBlocks) {
			block.render()
		}

		// then update each block's position
		for (let block of renderBlocks) {
			if (leftover > 0) {
				block.updatePositionOffset(leftover)
			}
		}
	}

	erase(block = this.firstBlock()) {
		this.jumpTo(block)
		process.stdout.write(ansiEscapes.eraseDown)
	}

	/**
	 * Jumps the cursor to a given section. By default the first row and column.
	 *
	 * @param {string|TextBlock} targetBlock - The block object or id we want to jump to.
	 * @param {integer} col - The col in this block we want to jump to.
	 * @param {integer} row - The row in this block we want to jump to.
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

	reset() {
		this.erase()
		this.renderedInitial = false
		this.blocks = {}
		this.numBlocks = 0
	}
}

module.exports = new Gymnast()
