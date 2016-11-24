# terminal-jumper
```
  $ npm install --save terminal-jumper
```

`terminal-jumper` makes it easy to output text for the terminal, as well as
update or move the cursor to different outputted sections.

# Usage

`npm run docs` for more details.

## API

### block(string, [string])
Create a block of text. Save it with an id string. `jumper.block('Some text', 'uniqueId')`

### find(string)
Finds a saved block of text by the given id.

### remove(string)
Removes a block of text by the given id.

### break
Adds a newline.

### render
Logs all text blocks.

### jumpTo(TextBlock|string, [number], [number])
Move the cursor to the start of a text block. Optionally give the number of
columns and rows to move to within this block.

## Example
Require:
```
const jumper = require('terminal-jumper')
```

Assuming you wanted to output the following text:
```
Folders:
folder-1/
folder-2/

Files:
file-1.txt
file-2.txt
```

You could use like so:
```
jumper.block('Folders:')
jumper.block('folder-1/')
jumper.block('folder-2/')
jumper.break()
jumper.block('Files:')
jumper.block('file-1.txt')
jumper.block('file-2.txt')
jumper.render()

// or...
jumper.block('Folders:\nfolder-1/\nfolder-2/')
jumper.block('Files:\nfile-1.txt\nfile-2.txt')
jumper.render()
```

To output some prompt and move the cursor to the end of the line, you could do:
```
jumper.block('Enter some user input: ', 'prompt')
jumper.render()
jumper.jumpTo('prompt', -1)
```

Which would output the following:
```
Enter some user input: _
```
