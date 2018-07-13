# terminal-jumper
> terminal rendering system for interactive programs

Gives you more control over text printed to the terminal window. You can render, erase, or update text, as well as move the cursor to specific areas of output.

```
$ npm install --save terminal-jumper
```

## Overview
There is a concept of "divisions" or sections of the window that `terminal-jumper` will render. By default one full-screen division is used, but any number of divisions can be set. Divisions must be set at instantiation and cannot be modified dynamically.

Divisions are what hold the actual text that will be printed to the terminal. You can add as many text blocks as you want, and you can update or remove them dynamically. Each division is responsible for rendering its own text content, and `terminal-jumper` will only render the divisions that need to be recalculated or re-rendered.

See the [examples](#examples) section or [API](#api) for more detail.

## Height
This program is meant to take up _at most_ the entire terminal window. Any text that extends beyond the window height will not be rendered. If you want to render text output that is scrollable in the terminal, this is not the right package. That said, any text blocks that extend beyond the window height (or division height), can be "scrolled" (erased and re-rendered) via their containing division.

This program will only take up the entire window if it needs to. By default, each division's height will shrink to the content inside of it (if the content inside extends beyond the window height, the division height will max-out at window height). For cases like the [bare-bones example](#bare-bones) below, the division height and therefore the program height is minimal, so only a portion of the window will be used.

## Examples

### Bare bones
```js
const TerminalJumper = require('terminal-jumper');

const jumper = new TerminalJumper();

jumper.addBlock('A Header');
jumper.addBlock('Some text output.');

jumper.render();
```

```
A Header
Some text output.
```

### Move cursor
Here there are two divisions side by side. We open STDIN so that the program doesn't immediately return, and then we move the cursor to the text on the right.

```js
const jumper = new TerminalJumper({
  divisions: [
    {
      id: 'left-division',
      top: 0,
      left: 0,
      width: 0.5
    },
    {
      id: 'right-division',
      top: 0,
      left: 0.5,
      width: 0.5
    }
  ]
});

process.openStdin();

jumper.addBlock('left-division.left-header-id', 'LEFT HEADER');
jumper.addBlock('left-division.left-text-id', 'I am text content on the left!');
jumper.addBlock('right-division.right-text-id', 'Please enter your name: > ');

jumper.chain();
jumper.render().jumpTo('right-division.right-text-id', -1);
jumper.execute();
```

```
LEFT HEADER                                 Please enter your name: > █
I am text content on the left!
```

## API
- [`TerminalJumperAPI.md`](./docs/TerminalJumperAPI.md)
- [`DivisionAPI.md`](./docs/DivisionAPI.md)
- [`TextBlockAPI.md`](./docs/TextBlockAPI.md)

## Performance
- Rendering
  - `terminal-jumper` keeps track of what divisions change between render calls. If a division doesn't change, then it won't be re-rendered.
- STDOUT writes
  - Writing one string to STDOUT is much more performant than writing multiple strings. Try to combine as many write strings as possible before finally writing to STDOUT. [TermanalJumper#chain](./docs/TerminalJumperAPI.md#chain) can help this.

## Debugging
If the `debug` option is given when instantiating, `terminal-jumper` will add another division that will keep track of which divisions are recalculated or re-rendered whenever `TerminalJumper#render` is called. By default this division will be on the top-right corner of the program, but this can be overridden by providing a [division options](../DivisionAPI.md#options) object to the `debug` option.
