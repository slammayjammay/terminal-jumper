const Division = require('./Division');

/**
 * In charge of rendering performance -- keeps track of which divisions need
 * recalculations and which divisions depend on dimensions of another division.
 *
 * Not in charge of all writes to STDOUT. For example in the case that a
 * division needs to scroll, no dimensions or recalculations need to happen even
 * though the division will need to render again. That will be done in
 * TerminalJumper.
 */
class Tree {
	constructor() {
		this.tree = { depth: 0, parent: null, children: [] };
		this.nodes = {};
		this._dirtyNodes = {};
		this._needsRenderNodes = {};
	}

	addDivision(division) {
		const node = { division, children: [], depth: 0, parent: null };

		const parentNode = (() => {
			const topDepends = typeof division.options.top === 'string';
			const leftDepends = typeof division.options.left === 'string';

			if (!topDepends && !leftDepends) {
				return this.tree;
			}

			// if this division depends on two other divisions, set it as a child
			// of whichever division is further down the tree
			const topNode = this.nodes[division.options.top];
			const topDepth = (topNode && topNode.depth) || -1;

			const leftNode = this.nodes[division.options.left];
			const leftDepth = (leftNode && leftNode.depth) || -1;

			return topDepth > leftDepth ? topNode : leftNode;
		})();

		node.depth = parentNode.depth + 1;
		node.parent = parentNode;

		parentNode.children.push(node);
		this.nodes[division.options.id] = node;
		this._dirtyNodes[division.options.id] = node;
		this._needsRenderNodes[division.options.id] = node;
	}

	removeDivision(division) {
		delete this.nodes[division.options.id];
		delete this._dirtyNodes[division.options.id];
		delete this._needsRenderNodes[division.options.id];
	}

	setDirty(division) {
		const startNode = division ? this.nodes[division.options.id] : this.tree;

		this.traverseNodes(startNode, node => {
			node.division._resetDimensions();
			this._dirtyNodes[node.division.options.id] = node;
			this._needsRenderNodes[node.division.options.id] = node;
		});
	}

	setNeedsRender(division) {
		const node = this.nodes[division.options.id];
		this._needsRenderNodes[division.options.id] = node;
	}

	dirtyNodes() {
		return Object.values(this._dirtyNodes);
	}

	needsRenderNodes() {
		return Object.values(this._needsRenderNodes);
	}

	resetDirtyNodes() {
		this._dirtyNodes = {};
	}

	resetNeedsRenderNodes() {
		this._needsRenderNodes = {};
	}

	/**
	 * BFS.
	 */
	traverseNodes(startNode, callback) {
		if (startNode instanceof Division) {
			startNode = this.nodes[startNode.options.id];
		} else if (typeof startNode === 'string') {
			startNode = this.nodes[startNode];
		}

		let idx = 0;
		const nodeList = (!startNode.parent) ? startNode.children.slice() : [startNode];

		while (idx < nodeList.length) {
			nodeList.push(...nodeList[idx].children);
			idx += 1;
		}

		for (let i = 0, l = nodeList.length; i < l; i++) {
			callback(nodeList[i]);
		}
	}
}

module.exports = Tree;
