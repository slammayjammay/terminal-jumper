const ansiEscapes = require('ansi-escapes')
const Section = require('./section')
const getCursorPosition = require('get-cursor-position')

/**
 * Gymnast. Helps jumping the cursor to different parts of outputted sections.
 * Useful for clearing specific lines or updating text.
 */
class Gymnast {
	constructor() {
		this.numSections = 0
		this.sections = {}
		this.renderedInitial = false
	}

	/**
	 * Outputs the given text and adds a newline to separate this section from
	 * other text.
	 *
	 * @param {string} text - The text that will header this section.
	 * @return {Section} - why not.
	 */
	section(id) {
		if (this.sections[id]) {
			return this.sections[id]
		}

		let section = new Section()

		if (typeof id === 'undefined') {
			id = this.generateUniqueSectionId()
		}
		this.numSections += 1
		this.sections[id] = section

		return section
	}

	line(text) {
		let currentSection = this.lastSection()
		currentSection.addLine(text)
	}

	generateUniqueSectionId() {
		let id = `section${this.numSections}`
		return id
	}

	firstSection() {
		let firstId = Object.keys(this.sections)[0]
		return this.sections[firstId]
	}

	lastSection() {
		let lastId = Object.keys(this.sections)[this.numSections - 1]
		return this.sections[lastId]
	}

	/**
	 * Erase everything, then render each section. When a section renders, it
	 * counts the number of times the screen scrolls when its text is printed.
	 * Once all sections are rendered, call each section to update its internal
	 * position with the offset count.
	 */
	render() {
		if (this.renderedInitial) {
			this.erase()
		} else {
			this.renderedInitial = true
		}

		let offsetCount = 0
		for (let section of Object.keys(this.sections).map(id => this.sections[id])) {
			section.render()
			offsetCount += section.getOffsetCount()

			// add a newline between sections
			let beforePos = getCursorPosition.sync()
			console.log()
			let afterPos = getCursorPosition.sync()

			if (beforePos.row === afterPos.row) {
				offsetCount += 1
			}
		}

		for (let section of Object.keys(this.sections).map(id => this.sections[id])) {
			section.updatePositionOffset(offsetCount)
			offsetCount -= section.height() + 1 // +1 for each newline between sections
			if (offsetCount <= 0) {
				return
			}
		}
	}

	erase() {
		this.jumpTo(this.firstSection())
		process.stdout.write(ansiEscapes.eraseDown)
	}

	/**
	 * Jumps the cursor to a given section. By default the first row and column.
	 *
	 * @param {Section} section - The section we want to jump to.
	 * Probably a good idea to accept custom id's as well.
	 * @return {Section}
	 */
	jumpTo(targetSection) {
		if (typeof targetSection === 'string') {
			targetSection = this.sections[targetSection]
			if (!targetSection) throw 'Invalid section id.'
		}

		let x = targetSection.position.col - 1
		let y = targetSection.position.row - 1
		process.stdout.write(ansiEscapes.cursorTo(x, y))

		return targetSection
	}
}

module.exports = Gymnast
