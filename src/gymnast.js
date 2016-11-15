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
		this.currentSection = null
		this.renderedInitial = false
	}

	/**
	 * Outputs the given text and adds a newline to separate this section from
	 * other text.
	 *
	 * @param {string} text - The text that will header this section.
	 * @return {Section} - why not.
	 */
	addSection(text) {
		let section = new Section(text)

		let uniqueSectionId = this.generateUniqueSectionId()
		this.sections[uniqueSectionId] = section
		this.currentSection = section

		return section
	}

	line(text) {
		let currentSection = this.lastSection()
		currentSection.addLine(text)
	}

	generateUniqueSectionId() {
		let id = `section${this.numSections}`
		this.numSections += 1
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

	render() {
		// Need to clear any printed content. First move the cursor to the very top
		// line, then clear everything down.
		if (this.renderedInitial) {
			this.erase()
		} else {
			this.renderedInitial = true
		}

		for (let sectionId of Object.keys(this.sections)) {
			let section = this.sections[sectionId]
			section.render()
 			console.log() // add spaces between sections
		}

		this.currentSection = this.lastSection()
	}

	erase() {
		this.jumpTo(this.firstSection())
		process.stdout.write(ansiEscapes.cursorUp())
		process.stdout.write(ansiEscapes.eraseDown)
	}

	/**
	 * Jumps the cursor to a given section. By default, it will jump to the end
	 * of the section's header line.
	 * To do this, it will start at the bottom of the output, and jump up each row
	 * in each section until it reaches the target section. Then it will jump to
	 * the end of the line.
	 *
	 * @param {Section} section - The section we want to jump to.
	 * Probably a good idea to accept custom id's as well.
	 */
	jumpTo(targetSection, flag) {
		if (this.currentSection === targetSection) {
			return
		}

		let sectionsArray = Object.keys(this.sections).map(id => this.sections[id]).reverse()
		let currentIdx = sectionsArray.indexOf(this.currentSection)
		let targetIdx = sectionsArray.indexOf(targetSection)

		for (let section of sectionsArray.slice(currentIdx, targetIdx + 1)) {
			// move the cursor up by the section height. Plus one because sections
			// are separated by newlines
			process.stdout.write(ansiEscapes.cursorUp(section.height + 1))
		}

		this.currentSection = targetSection
	}
}

module.exports = Gymnast
