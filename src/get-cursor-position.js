// const ansiEscapes = require('ansi-escapes')
// const execSync = require('child_process').execSyc
//
// const ESC = '^[['
// const DIVIDER = ';'
//
// module.exports = () => {
// 	let cursorPosString = execSync('echo \u001b[6n')
//
// 	// chop off the first bit and remove the last 'R'
// 	let pos = cursorPosString.slice(ESC.length, cursorPosString.length - 1)
// 	let dividerIdx = pos.indexOf(DIVIDER)
//
// 	let x = parseInt(pos.slice(0, dividerIdx))
// 	let y = pos.slice(dividerIdx + 1)
//
// 	return { x, y }
// }
