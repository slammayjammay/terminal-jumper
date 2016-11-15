#!/usr/bin/env node
'use strict'

const join = require('path').join
const readline = require('readline')
const chalk = require('chalk')
const ansiEscapes = require('ansi-escapes')
const getCursorPosition = require('get-cursor-position')
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

gymnast.section('enter').text(`${chalk.green('Enter a file glob: ')}`)
gymnast.section('files').text(`${chalk.green('Files found: ')}`)
gymnast.section('files').text(chalk.red('package.json\nindex.html\nindex.js'))


gymnast.render()
gymnast.jumpTo('enter').jumpTo(-1, 0)

process.stdin.on('data', (data) => {
	gymnast.jumpTo('files')
	// gymnast.render()
})
