const { assert } = require('chai');
const evaluator = require('../src/evaluator');

const EVAL = (...args) => evaluator.evaluate(...args);

describe('Evaluator', () => {
	describe('evaluates expressions without operations', () => {
		it('converts a number in a string to a number', () => {
			assert.equal(EVAL('12'), 12);
		});

		it ('converts a number with unit when giving a map', () => {
			assert.equal(EVAL('30%', { '%': 10 }), 3);
		});

		it ('converts a number with unit when giving a function', () => {
			const cb = (num, unit) => {
				if (unit === '%') {
					return parseFloat(num) / 100 * 10;
				}
			};
			assert.equal(EVAL('30%', cb), 3);
		});
	});

	describe('can perform basic unitless operations', () => {
		it('can add', () => assert.equal(EVAL('5 + 5'), 10));
		it('can subtract', () => assert.equal(EVAL('5 - 5'), 0));
		it('can multiply', () => assert.equal(EVAL('5 * 5'), 25));
		it('can divide', () => assert.equal(EVAL('5 / 5'), 1));
	});

	describe('can perform basic operations between numbers with and without units', () => {
		it('can operate a LH unit number with a RH unitless number', () => {
			assert.equal(EVAL('25% + 5', { '%': 100 }), 30);
		});

		it('can operate a LH unitless number with a RH unit number', () => {
			assert.equal(EVAL('5 + 25%', { '%': 100 }), 30);
		});
	});

	describe('can perform multiple flat operations', () => {
		it('can add three numbers', () => assert.equal(EVAL('2 + 10 + 8'), 20));
		it('can add four numbers', () => assert.equal(EVAL('2 + 10 + 8 + 100'), 120));
		it('can subtract three numbers', () => assert.equal(EVAL('2 - 10 - 8'), -16));
		it('can subtract four numbers', () => assert.equal(EVAL('2 - 10 - 8 - 100'), -116));
		it('adheres to proper order of operations', () => {
			assert.equal(EVAL('1 + 2 * 5'), 11);
			assert.equal(EVAL('1 * 2 + 5'), 7);
			assert.equal(EVAL('20 / 4 + 5 * 3'), 20);
			assert.equal(EVAL('20 / 4 + 6 * 3 / 9'), 7);
			assert.equal(EVAL('20 / 4 + 6 * 3 / 9 + 14 / 2'), 14);
		});
	});

	describe('can perform sub expressions', () => {
		it('does not break when sub expression is a number', () => {
			assert.equal(EVAL('5 + (5)'), 10);
			assert.equal(EVAL('5 + (5%)', { '%': 10 }), 5.5);
		});

		it('does not break with multiple sub expressions', () => {
			assert.equal(EVAL('(10 + 55) + (5 - 3)'), 67);
		});

		it('does not break with multiple nested sub expressions', () => {
			assert.equal(EVAL('20 + (10 + (5 - 3) * (4 - (10 / 5)))'), 34);
		});

		it('can attach units to a subexpression', () => {
			assert.equal(EVAL('(24 / 2)%', { '%': 100 }), 12);
		});

		it('can attach units to complicated nested subexpressions', () => {
			assert.equal(EVAL('((2 * (5 * 3 + 10))% * 0.5)%', { '%': 100 }), 25);
		});
	});

	describe('can compute recognized Math functions', () => {
		it('can compute e.g. the absolute value of a number', () => {
			assert.equal(EVAL('abs(-40)'), 40);
		});

		it('can call nested functions', () => {
			assert.equal(EVAL('max(0, min(10, 9999999))'), 10);
		});

		it('can evaluate arguments passed to functions', () => {
			assert.equal(EVAL('pow(5, 10 - 7)'), 125);
		});

		it('can evaluate nested arguments passed to nested functions', () => {
			assert.equal(EVAL('pow(25 / min(5, 10 - 3), abs(floor(-3.6) + 1))'), 125);
		});
	});

	describe('can perform various complicated expressions', () => {
		const width = 75;
		const height = 50;
		const calcPercentage = (percent, num) => parseFloat(percent) / 100 * num;

		const parser = (num, unit) => {
			if (unit === '%w') {
				return calcPercentage(num, width);
			} else if (unit === '%h') {
				return calcPercentage(num, height);
			}
		};

		// TODO
		// assert.equal(EVAL('20%w + 50%h', parser), 40);
		// assert.equal(EVAL('(20%w + 50%h)', parser), 40);
	});
});
