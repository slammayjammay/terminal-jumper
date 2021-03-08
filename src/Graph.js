const Division = require('./Division');

const STATUS = {
	CLEAN: 0,
	NEEDS_RENDER: 1,
	DIRTY: 2
};

/**
 * In charge of rendering performance -- keeps track of which divisions need
 * recalculations and which divisions depend on dimensions of another division.
 */
class Tree {
	constructor(jumper) {
		this.jumper = jumper;
		this.nodes = new Map();
	}

	createNode(division) {
		return {
			division,
			status: STATUS.CLEAN,
			links: new Set() // when this div changes, others need to as well
		};
	}

	setDivisions(divisions) {
		const nodesToKeep = {};

		for (const division of divisions) {
			nodesToKeep[division.options.id] = true;

			if (!this.nodes.has(division.options.id)) {
				this.nodes.set(division.options.id, this.createNode(division));
			}
		}

		for (const id of this.nodes.keys()) {
			if (!nodesToKeep[id]) {
				this.nodes.delete(id);
			}
		}
	}

	calculateGraph() {
		for (const node of this.nodes.values()) {
			node.links.clear();
		}

		const props = ['top', 'left', 'width', 'height'];

		for (const node of this.nodes.values()) {
			const id = node.division.options.id;

			const dependentNodes = props.reduce((set, prop) => {
				const expression = node.division.options[prop];
				if (typeof expression !== 'string') {
					return set;
				}

				this.jumper.replaceBrackets(expression, insides => {
					if (this.jumper.hasDivision(insides) && insides !== id) {
						set.add(this.nodes.get(insides));
					}
				});
				return set;
			}, new Set());

			dependentNodes.forEach(dependent => dependent.links.add(node));
		}
	}

	setNeedsRender(division) {
		if (!division) {
			this.nodes.forEach(node => node.status = node.status || STATUS.NEEDS_RENDER);
			return;
		}

		const node = this.nodes.get(division.options.id);
		if (!node) {
			return;
		}

		node.status = node.status || STATUS.NEEDS_RENDER;

		this.jumper.renderInjects.set(`before:erase:${division.options.id}`, () => {
			return division.eraseString();
		});
	}

	setDirty(division) {
		if (!division) {
			return this.nodes.forEach(node => node.status = STATUS.DIRTY);
		}

		const node = this.nodes.get(division.options.id);
		if (!node) {
			return;
		}

		this.traverse(node, (child, { depth, parent }) => {
			if (child.status === STATUS.DIRTY) {
				return;
			}

			child.status = STATUS.DIRTY;
			child.depth = depth;
			child.parent = parent;

			child.division._resetDimensions();
		});
	}

	calculateDirtyNodes() {
		this.nodes.forEach(node => {
			if (node.status === STATUS.DIRTY) {
				node.division._calculateDimensions(true);
				node.status = STATUS.NEEDS_RENDER;
			}
		});
	}

	getNeedsRenderNodes() {
		return Array.from(this.nodes.values()).filter(node => {
			return node.status === STATUS.NEEDS_RENDER;
		});
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

	clean() {
		this.nodes.forEach(node => node.status = STATUS.CLEAN);
	}

	destroy() {
		this.nodes.clear();
		this.jumper = this.nodes = null;
	}
}

module.exports = Tree;
