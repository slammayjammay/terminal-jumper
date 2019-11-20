# Graph

## Timeline
- some div's content changes -- deps might need recalculating
- defer calculations until next render or next "get", whichever is first
  - if no "gets" are made before the next render, calculate entire batch
  - if a "get" is made before next render, calculate only necessary divs

### Example
- div-1
  - div-2
    - div-3
  - div-4
    - div-5
- div-6

1) add a block to div-2
  i) set div-2, div-3 dirty

2) add a block to div-4
  i) set div-4, div-5 dirty

3) call (div-3).top() -- ?
  i) calculate div-2
  ia) if div-2's dimensions have changed, calculate div-3 and return
  ib) otherwise div-3 does not need calculating; return

4) wait until right before next render...

5) calculate div-4
  i) repeat 3ia, 3ib for div-5
  ii) render

## Implementation
- construct top-down graph: each node has a list of nodes that depend on it
- maybe need a second graph just for the nodes that need rendering?

- node statuses:
  - CLEAN -- no render/calculations needed for next render
  - NEEDS_RENDER -- render needed; dimensions have not changed
  - DIRTY -- render and calculations needed
  - HAS_CHANGED -- node was DIRTY; after recalculating dimensions have changed. still needs render
  - HAS_NOT_CHANGED -- node was DIRTY, but after recalculating dimensions have not changed. still needs render
  - ANCESTOR_DIRTY -- possible that status is DIRTY, depending on whether ANCESTOR's dimensions have changed

- if a node is marked DIRTY, all subnodes must be ANCESTOR_DIRTY or DIRTY

1) when setting a node as DIRTY:
  i) find all sub-deps that are CLEAN and mark as ANCESTOR_DIRTY

2) when "getting" on a DIRTY node:
  i) calculate, mark as HAS_CHANGED or HAS_NOT_CHANGED

3) when "getting" on an ANCESTOR_DIRTY node:
  i) get DIRTY ancestor
