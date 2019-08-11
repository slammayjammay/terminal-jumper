const Division = require('./Division');

/**
 * In charge of rendering performance -- keeps track of which divisions need
 * recalculations and which divisions depend on dimensions of another division.
 */
class Tree {
	constructor() {
		this.nodes = new Map();
		this.dirtyNodes = new Map();
		this.needsRenderNodes = new Map();
	}

	setDivisions(divisions) {
		this.nodes.clear();

		for (const division of divisions) {
			this.nodes.set(division.options.id, { division, links: new Map() });
		}
	}

	calculateGraph() {
		for (const node of this.nodes.values()) {
			node.links.clear();
		}

		const props = ['top', 'left', 'bottom', 'right'];

		for (const node of this.nodes.values()) {
			const id = node.division.options.id;

			const dependentNodes = props.reduce((arr, prop) => {
				const dependentId = this._getDependentDivisionId(id);
				!!dependentId && arr.push(this.nodes.get(dependentId));
				return arr;
			}, []);

			dependentNodes.forEach(dependent => dependent.links.set(id, node));
		}
	}

	_getDependentDivisionId(id) {
		if (typeof id !== 'string') {
			return false;
		}

		if (this.nodes.get(id)) {
			return id;
		}

		const match = /\{(.*)\}/.exec(id);
		return match && match[1];
	}

	setDirty(division) {
		if (!division) {
			this.dirtyNodes.clear();
			this.needsRenderNodes.clear();
			this.dirtyNodes = new Map([...this.nodes]);
			this.needsRenderNodes = new Map([...this.nodes]);
			return;
		}

		const startNode = this.nodes.get(division.options.id);

		if (!startNode) {
			console.log(this.nodes);
			throw new Error(`Unrecognized division "${division.options.id}"`);
		}

		this.traverse(startNode, node => {
			node.division._resetDimensions();
			this.dirtyNodes.set(node.division.options.id, node); // TODO: context
			this.needsRenderNodes.set(node.division.options.id, node);
		});
	}

	setNeedsRender(division) {
		const node = this.nodes.get(division.options.id);
		this.needsRenderNodes.set(division.options.id, node);
	}

	allNodes() {
		const allNodes = [];
		this.traverse(this.tree, node => allNodes.push(node));
		return allNodes;
	}

	traverse(startNode, callback) {
		if (startNode instanceof Division) {
			startNode = this.nodes.get(startNode.options.id);
		} else if (typeof startNode === 'string') {
			startNode = this.nodes.get(startNode);
		}

		const cache = {};
		let depth = 0;
		let parent = null;

		function traverse(node) {
			if (cache[node.division.options.id]) {
				return;
			}
			cache[node.division.options.id] = true;

			callback(node, { depth, parent });

			depth++;
			parent = node;

			node.links.forEach(traverse);
		}

		traverse(startNode);
	}

	destroy() {
		this.nodes = this.dirtyNodes = this.needsRenderNodes = null;
	}
}

module.exports = Tree;
