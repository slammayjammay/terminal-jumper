# `TerminalJumper` API

## `new TerminalJumper(object options)`
### options.divisions
An array containing [division options](../docs/DivisionAPI.md#options).

### options.debug
Boolean indicating whether to add the [debug division](../README.md#debugging).

## Instance Methods
### getDivision(string id)
Returns the division specified by the given id, or `undefined`.

### topDivision()
Returns the top-most division.

### bottomDivision()
Returns the bottom-most division.

### addBlock(string|Division targets, [string text])
If a string is given, it will specify the division id and then the (optional) `blockId`, separated by a period. Then returns `Division#addBlock(blockId, text)`.

### hasBlock(string id)
If a string is given, it will specify the division id and then the `blockId`, separated by a period. Then returns `Division#hasBlock(blockId)`.

### getBlock(string id)
If a string is given, it will specify the division id and then the `blockId`, separated by a period. Then returns `Division#getBlock(blockId)`.

### height([string|Division] division)
If a division is given, returns `division.height()`. Otherwise, returns the total height of the program.

### chain()
Internally builds a string that holds a sequence of STDOUT writes. Any method that usually writes to STDOUT (`render`, `erase`, `jumpTo`) will instead be appended to this string, until `execute` is called.

### appendToChain(string string)
Appends the string to the internal chain of STDOUT writes.

### execute()
Writes the internal chain to STDOUT, and empties the chain string. Until `chain` is called again, all methods will write directly to STDOUT.

### render()
Gets the render string by calling `renderString`, then either writes to STDOUT or appends to the internal chain string (see [TerminalJumper#chain](#chain)).

### renderString()
Returns a string that when written to STDOUT will render the program. For any division that needs recalculating or re-rendering, appends the division's `renderString` to this one.

### erase()
Gets the erase string by calling `eraseString`, then either writes to STDOUT or appends to the internal chain string (see [TerminalJumper#chain](#chain)).

### eraseString()
Returns a string that when written to STDOUT will render the program. For all divisions, appends the division's `eraseString` to this one.

### jumpTo(string|Division target, [number col=0], [number row=0])
Moves the cursor to the specified target. Gets the jump string by calling `jumpToString`, then either writes to STDOUT or appends to the internal chain string (see [TerminalJumper#chain](#chain)).

### jumpToString(string|Division target, [number col=0], [number row=0])
If a string is given, it will specify the division id and then the (optional) `blockId`, separated by a period. Then returns `division.jumpTo(blockId, col, row)`.

### scroll(string|Division division, [number scrollX], [number scrollY])
Returns `division.scroll(scrollX, scrollY)`.

### scrollX(string|Division division, number scrollX)
Returns `division.scrollX(scrollX)`.

### scrollY(string|Division division, number scrollY)
Returns `division.scrollY(scrollY)`.

### scrollUp(string|Division division, number amount)
Returns `division.scrollUp(amount)`.

### scrollDown(string|Division division, number amount)
Returns `division.scrollDown(amount)`.

### scrollLeft(string|Division division, number amount)
Returns `division.scrollLeft(amount)`.

### scrollRight(string|Division division, number amount)
Returns `division.scrollRight(amount)`.

### getTermSize()
Returns the total size of the window that this program can use.

### destroy()
Calls `Division#destroy` for all divisions, removes all listeners, and frees up memory for garbage collection.
