const Division = require('./Division');

/**
 * In charge of rendering performance -- keeps track of which divisions need
 * recalculations and which divisions depend on dimensions of another division.
 */
class Tree {
	constructor(jumper) {
		this.jumper = jumper;
		// TODO: this is bad. do graph instead
		this.tree = { depth: 0, parent: null, children: [] };
		this.nodes = {};
		this._dirtyNodes = {};
		this._needsRenderNodes = {};
	}

	addDivision(division) {
		const node = { division, children: [], depth: 0, parent: null };

		const parentNode = (() => {
			let parent = this.tree;

			for (const prop of ['top', 'left', 'right', 'bottom']) {
				const dependentId = this._getDependentDivisionId(division.options[prop]);
				if (!dependentId || !this.nodes[dependentId]) {
					continue;
				}

				const dependent = this.nodes[dependentId];

				if (dependent.depth > parent.depth) {
					parent = dependent;
				}
			}

			return parent;
		})();

		node.depth = parentNode.depth + 1;
		node.parent = parentNode;

		parentNode.children.push(node);
		this.nodes[division.options.id] = node;
		this._dirtyNodes[division.options.id] = node;
		this._needsRenderNodes[division.options.id] = node;
	}

	_getDependentDivisionId(str) {
		if (typeof str !== 'string') {
			return false;
		}

		if (this.jumper.hasDivision(str)) {
			return str;
		}

		const match = /\{(.*)\}/.exec(str);
		return match && match[1];
	}

	removeDivision(division) {
		const node = this.nodes[division.options.id];
		node.parent.children.splice(node.parent.children.indexOf(node), 1);

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

	allNodes() {
		const allNodes = [];
		this.traverseNodes(this.tree, node => allNodes.push(node));
		return allNodes;
	}

	dirtyNodes() {
		return Object.values(this._dirtyNodes).sort((a, b) => {
			return (a.depth < b.depth) ? -1 : 1;
		});
	}

	needsRenderNodes() {
		return Object.values(this._needsRenderNodes).sort((a, b) => {
			return (a.depth < b.depth) ? -1 : 1;
		});
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

	destroy() {
		this.jumper = this.tree = this.nodes = this._dirtyNodes = this._needsRenderNodes = null;
	}
}

module.exports = Tree;
