const getCursorPosition = require('get-cursor-position')
const Line = require('./line')

class Section {
	/**
	 * For now, assume all sections must have header text.
	 *
	 * @param {string} text - The header text.
	 * @prop {string} header - The header text.
	 * @prop {integer} height - The number of lines in this section.
	 * @prop {object} position - Contains the x and y positions.
	 */
	constructor(text) {
		this.height = 0
		this.lines = {}
		this.position = null

		this.addLine(text, 'header')
	}

	/**
	 * @param {string} text - The text to display.
	 * @param {string} [id] - The custom id to store this text.
	 */
	addLine(text, id) {
		let texts = text.split('\n')
		if (texts.length > 1 && typeof id !== 'undefined') {
			throw 'Cannot set id for multiple lines (text contains newlines)'
		}

		if (typeof id === 'undefined') {
			id = this.generateUniqueLineId()
		}

		for (let text of texts) {
			this._addLine(text, id)
			id = this.generateUniqueLineId()
		}
	}

	/**
	 * Private method. Adds a line to this section. Text and id are required.
	 * Strips text of ansi escape codes.
	 *
	 * @param {string} text - The text to display.
	 * @param {string} id - The custom id to store this text.
	 */
	_addLine(text, id) {
		this.lines[id] = new Line(text)
		this.height += 1
	}

	generateUniqueLineId() {
		return `line${this.height}`
	}

	updateCursorPosition() {
		this.position = getCursorPosition.sync()
	}

	render() {
		this.updateCursorPosition()

		for (let lineId of Object.keys(this.lines)) {
			console.log(this.lines[lineId].text)
		}
	}
}

module.exports = Section
