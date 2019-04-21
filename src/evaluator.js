const REGS = {};
REGS.OPERAND = '[\\*\\/\\-\\+]';
REGS.NUM = '[\\-\\d\\.]+';
REGS.UNIT = '[%\\w]*';
REGS.NUM_WITH_UNIT = `${REGS.NUM}${REGS.UNIT}`;

class Evaluator {
	/**
	 * @param {string|number} expression - the expression to evaluate.
	 * @param {function|object} fnOrObj
	 * @return {number}
	 */
	evaluate(expression, fnOrObj) {
		if (typeof expression === 'number') {
			return expression;
		}

		const flat = this.flatten(expression, fnOrObj);
		return this.evaluateFlatExpression(flat, fnOrObj);
	}

	/**
	 * @param {string|number} exp - the expression to evaluate.
	 * @param {function|object} fnOrObj
	 * @return {string}
	 */
	flatten(exp, fnOrObj) {
		let leftIdx = null;
		let rightIdx = null;;

		// find the first flat sub expression
		for (let i = 0, l = exp.length; i < l; i++) {
			const char = exp[i];

			if (char === '(') {
				leftIdx = i;
			} else if (char === ')') {
				rightIdx = i;
				break;
			}
		}

		// mismatched parenthesis error
		if (typeof leftIdx !== typeof rightIdx) {
			throw new Error(`Invalid expression "${exp}" -- could not find matching parenthesis.`);
		}

		// evaluate sub expression and replace the original expression with the result
		if (leftIdx !== null && rightIdx !== null) {
			const subExpression = exp.slice(leftIdx + 1, rightIdx);
			const evaluated = this.evaluateFlatExpression(subExpression, fnOrObj);
			const replaced = exp.slice(0, leftIdx) + evaluated + exp.slice(rightIdx + 1);
			return this.evaluate(replaced, fnOrObj);
		}

		return exp;
	}

	/**
	 * @param {string} expression
	 * @param {function|object} fnOrObj
	 * @return {number}
	 */
	evaluateFlatExpression(expression, fnOrObj) {
		const isOneNumberReg = new RegExp(`^\\s*${REGS.NUM_WITH_UNIT}\\s*$`);
		if (isOneNumberReg.test(expression)) {
			return this.convertUnitsToNumber(expression, fnOrObj);
		}

		let exp = expression;
		const orderOfOperations = ['[\\*\\/]', '[\\+\\-]'];

		for (const operation of orderOfOperations) {
			const regex = this._createOperationRegex(operation);

			let match;
			while (match = regex.exec(exp)) {
				const result = this.operate(match[1], match[2], match[3], fnOrObj);
				exp = exp.replace(regex, result);
			}
		}

		return parseFloat(exp);
	}

	/**
	 * @param {string|number} num1
	 * @param {string} operand
	 * @param {string|number} num2
	 * @param {function|object} fnOrObj
	 * @return {number}
	 */
	operate(num1, operand, num2, fnOrObj) {
		if (typeof num1 === 'string') num1 = this.convertUnitsToNumber(num1, fnOrObj);
		if (typeof num2 === 'string') num2 = this.convertUnitsToNumber(num2, fnOrObj);

		if (operand === '*') return num1 * num2;
		if (operand === '/') return num1 / num2;
		if (operand === '+') return num1 + num2;
		if (operand === '-') return num1 - num2;

		throw new Error(`Do not know how to operate "${num1} ${operand} ${num2}".`);
	}

	/**
	 * @param {string} expression - A string of a number combined with a unit.
	 * @param {function|object} fnOrObj - If a function, it will be called with
	 * two arguments: a number as a float and the unit string. The return value
	 * will should be a number. If an object, this assumes that there is a default
	 * parser function for the unit. The object should have a key equal to the
	 * unit string, and the value will be passed along to the default parser, in
	 * addition to the number and unit (the value type can be anything, as it
	 * may depend on the unit being used).
	 */
	convertUnitsToNumber(expression, fnOrObj) {
		const regex = new RegExp(`\\s*(${REGS.NUM})(${REGS.UNIT})\\s*`);
		const [_, numString, unit] = regex.exec(expression);

		const number = parseFloat(numString);

		if (!unit) {
			return number;
		}

		if (typeof fnOrObj === 'function') {
			return fnOrObj(number, unit);
		} else if (typeof fnOrObj === 'object') {
			return this.defaultUnitParser(number, unit, fnOrObj[unit]);
		} else {
			throw new Error(`Do not know how to calculate unit "${unit}" in expression "${expression}".`);
		}
	}

	/**
	 * @param {number} num - The number preceeding the unit.
	 * @param {string} unit - The unit associated with the number.
	 * @param {any} [additional] - Any additional arguments required.
	 */
	defaultUnitParser(num, unit, additional) {
		if (unit === '%') {
			if (typeof additional !== 'number') {
				throw new Error(`Do not know how to parse "${num}${unit}" -- please provide a number associated with "${unit}" to calculate against, or provide a custom parsing function (received "${additional}").`);
			}
			return parseFloat(num) / 100 * additional;
		}
	}

	_createOperationRegex(operand = REGS.OPERAND) {
		const [NUM, OP] = [REGS.NUM_WITH_UNIT, operand];
		return new RegExp(`\\s*(${NUM})\\s*(${OP})\\s*(${NUM})\\s*`);
	}
}

module.exports = new Evaluator();
