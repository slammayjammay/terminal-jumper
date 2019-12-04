class RenderInjects {
	constructor() {
		this.map = new Map();
	}

	has() { return this.map.has(...arguments); }
	get() { return this.map.get(...arguments); }
	set() { return this.map.set(...arguments); }

	inject(onlyIf) {
		let string = '';

		for (const [key, value] of Array.from(this.map.entries())) {
			if (onlyIf.test(key)) {
				this.map.delete(key);
				string += (typeof value === 'function' ? (value() || '') : value);
			}
		}

		return string;
	}

	remove(onlyIf) {
		for (const [key, value] of Array.from(this.map.entries())) {
			if (onlyIf.test(key)) {
				this.map.delete(key);
			}
		}
	}
}

module.exports = new RenderInjects();
