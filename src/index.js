#!/usr/bin/env node
'use strict'

const join = require('path').join
const readline = require('readline')
const chalk = require('chalk')
const Gymnast = require(join(__dirname, './gymnast'))

// readline.emitKeypressEvents(process.stdin)
// process.stdin.setRawMode(true)
process.stdin.resume()
// // make sure to exit!
// process.stdin.on('keypress', (char, key) => {
// 	if (key.ctrl && key.name === 'c') {
// 		process.exit()
// 	}
// })


let gymnast = new Gymnast()

let enterSection = gymnast.addSection(`${chalk.green('Enter a file glob: ')}`)
let filesSection = gymnast.addSection(chalk.green('Files found: '))

filesSection.addLine(chalk.red('package.json\nindex.html\nindex.js'))


gymnast.render()
gymnast.jumpTo(enterSection, true)

process.stdin.on('data', (data) => {
	gymnast.render()
})
