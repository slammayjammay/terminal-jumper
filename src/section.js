const ansiEscapes = require('ansi-escapes')
const getCursorPosition = require('get-cursor-position')
const TextBlock = require('./text-block')

class Section {
	/**
	 * For now, assume all sections must have header text.
	 *
	 * @param {string} text - The header text.
	 * @prop {object} position - Contains the global position as { row, col }
	 */
	constructor() {
		this.idCounter = 0
		this.texts = {}
		this.position = null
		this.offsetCount = 0
	}

	/**
	 * @param {string} text - The text to display.
	 * @param {string} [id] - The custom id to store this text.
	 */
	text(text, id) {
		if (typeof id === 'undefined') {
			id = this.generateUniqueLineId()
		}

		this.texts[id] = new TextBlock(text)
		return this
	}

	height() {
		let height = 0
		for (let textId of Object.keys(this.texts)) {
			let text = this.texts[textId]
			height += text.height
		}

		return height
	}

	generateUniqueLineId() {
		let id = `text${this.idCounter}`
		this.idCounter += 1
		return id
	}

	/**
	 * Logs all the text in section.texts, records the global position, and keeps
	 * track of the number of times the screen scrolled (see Gymnast#render).
	 */
	render() {
		this.position = getCursorPosition.sync()

		for (let text of Object.keys(this.texts).map(id => this.texts[id])) {
			text.render()
			this.offsetCount += text.getOffsetCount()
		}
	}

	getOffsetCount() {
		let offsetCount = this.offsetCount
		this.offsetCount = 0
		return offsetCount
	}

	/**
	 * Called after all content is rendered. Gymnast keeps track of how many times
	 * the screen scrolled (thus invalidating each section's position) and passes
	 * each section the number of rows their position is off by.
	 *
	 * @param {integer} offsetCount - The offset this section's internal position
	 * needs to update by.
	 */
	updatePositionOffset(offsetCount) {
		this.position.row -= offsetCount
	}

	/**
	 * Jumps to the correct cursor position within this section for the given
	 * coordinate.
	 *
	 * @param {integer} x - The x position
	 * @param {integer} y - The y position
	 */
	jumpTo(x = 0, y = 0) {
		let texts = Object.keys(this.texts).map(id => this.texts[id])
		let target

		// each text object can contain multiple lines, so go through each one
		// until we get within the bounds of one.
		for (let text of texts) {
			if (text.height - 1 < y) {
				y -= text.height
				process.stdout.write(ansiEscapes.cursorDown(text.height))
			} else if (text.height - 1 >= y) {
				target = text
				break
			}
		}

		if (!target) {
			throw 'y position does not point to a text block.'
		}

		target.jumpTo(x, y)
	}
}

module.exports = Section
