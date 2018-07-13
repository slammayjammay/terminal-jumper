# `TextBlock` API

## Instance methods
### content(string text)
Sets the text of this block to the given text.

### append(string text)
Appends the given text to the text block.

### height()
Returns the total height of this text block in the context of the containing division.

### lines()
Returns an array of all the lines of this block. If the division's `overflowX` is "wrap", the number of lines may be greater than when splitting the text on newlines.

### remove()
Removes this text block from its containing division.

### getRow(number row)
Returns one of this block's wrapped lines specified by `row`.

### getWidthOnRow(number row)
Gets the specified row by calling `getRow`, then returns the width of the row (the width of the text after stripping ansi escape sequences).

### destroy()
Frees up memory for garbage collection.
