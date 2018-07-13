# `Division` API

## `new Division(object options)`
Note: division options must be given when instantiating `TerminalJumper`. You will never need to call `new Division()` manually.

### options.top -- number|string
If a number is given, specifies the top offset of this division. Must be a percentage (0<=number<=1) of the terminal size. If a string is given, specifies the id of another division and will set the top of this division to the bottom of the other.

### options.left -- number|string
If a number is given, specifies the left offset of this division. Must be a percentage (0<=number<=1) of the terminal size. If a string is given, specifies the id of another division and will set the left of this division to the right of the other.

### options.width -- number|string
The width of this division. Must be a percentage (0<=number<=1) of the window.

### [options.height] -- number
The height of this division. Must be a percentage (0<=number<=1) of the window. If not given, will shrink to the height of the content inside.

### [options.id] -- string
The id of this division. If not set, a default id will be used.

### [options.overflowX] -- string="wrap"
How horizontal overflow is handled. Can either by "wrap" or "scroll".

### [options.overflowY] -- string="auto"
How vertical overflow is handled. Can either by "auto" or "scroll". If set to "auto", the division content determines the division height, until the program fills up the entire screen. At that point, the division will scroll any content outside of the viewport.

### [options.wrapOnWord] -- boolean=true
When wrapping horizontal overflow, wraps on word breaks instead of in the the middle of words.

## Instance Methods
### addBlock(string text, [string id])
Adds a text block.

### getBlock(string id)
Gets a text block.

### hasBlock(string id)
Returns a boolean whether a text block exists.

### removeBlock(string|TextBlock block)
Removes a text block.

### top()
Gets the top offset of this division, in number of rows.

### left()
Gets the left offset of this division, in number of columns.

### width()
Gets the width of this division, in number of columns.

### height()
Gets the height of this division, in number of rows.

### allLines()
Gets all the block lines that are present in this division. See [TextBlock#lines](./TextBlockAPI.md#lines).

### scrollPosX()
Gets the current horizontal scroll position.

### scrollPosY()
Gets the current vertical scroll position.

### maxScrollX()
Gets the maximum horizontal scroll position.

### maxScrollY()
Gets the maximum vertical scroll position.

### scroll(number scrollX, number scrollY)
Sets the scroll position to the given scrollX and scrollY values. Does not actually render anything -- you must call `TerminalJumper#render` to update.

### scrollX(number scrollX)
Sets the horizontal scroll position to scrollX.

### scrollY(number scrollY)
Sets the vertical scroll position to scrollY.

### scrollUp(number amount)
Scrolls up by the given amount.

### scrollDown(number amount)
Scrolls down by the given amount.

### scrollLeft(number amount)
Scrolls left by the given amount.

### scrollRight(number amount)
Scrolls right by the given amount.

### render()
Gets the render string by calling `renderString`, then writes to STDOUT.

### renderString()
Returns a string that when written to STDOUT will render the division.

### erase()
Gets the erase string by calling `eraseString`, then writes to STDOUT.

### eraseString()
Returns a string that when written to STDOUT will erase the division.

### jumpTo(falsy|string|TextBlock block, [number col=0], [number row=0])
Moves the cursor to the specified target. Gets the jump string by calling `jumpToString`, then writes to STDOUT.

### jumpToString(falsy|string|TextBlock block, [number col=0], [number row=0])
If a block is given, will jump to the coordinates inside the given text block. Otherwise the coordinates refer to the bounds of this division. Returns a string that will move the cursor to the specified coordinates.

### destroy()
Calls `TextBlock#destroy` for all text blocks and frees up memory for garbage collection.
