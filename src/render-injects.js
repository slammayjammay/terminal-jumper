class RenderInjects {
	constructor() {
		this.map = new Map();
	}

	has() { return this.map.has(...arguments); }
	get() { return this.map.get(...arguments); }
	set() { return this.map.set(...arguments); }
	delete() { return this.map.delete(...arguments); }

	inject(onlyIf) {
		const string = [];

		for (const [key, value] of Array.from(this.map.entries())) {
			if (onlyIf.test(key)) {
				this.map.delete(key);
				string.push(typeof value === 'function' ? (value() || '') : value);
			}
		}

		return string.join('');
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
