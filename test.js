#!/usr/bin/env node
'use strict'

const join = require('path').join
const readline = require('readline')
const chalk = require('chalk')
const ansiEscapes = require('ansi-escapes')
const getCursorPosition = require('get-cursor-position')
const Gymnast = require(join(__dirname, './src/gymnast'))

let gymnast = new Gymnast()
process.stdin.resume()

gymnast.section('enter').text(`${chalk.green('Enter a file glob: ')}`)
gymnast.section('files').text(`${chalk.green('Files found:')}`)
gymnast.section('files').text(chalk.red('package.json\nindex.html\nindex.js'))

gymnast.render()
gymnast.jumpTo('enter')
