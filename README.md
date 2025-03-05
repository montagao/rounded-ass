# rounded-ass

A Node.js library and CLI tool to generate ASS subtitle files with rounded background boxes from SRT or VTT subtitle files.

## Features

- Converts SRT or VTT subtitles to ASS with rounded background boxes
- Auto-detects subtitle file format from file extension (.srt or .vtt)
- Customizable appearance: font, font size, colors, opacity, padding, border radius
- Auto-determines border radius if not specified
- Works with different scripts including CJK, Arabic, and Hebrew
- Accurate subtitle measurement for precise background sizing

## Installation

```bash
npm install -g rounded-ass
```

Or for local use:

```bash
npm install rounded-ass
```

## CLI Usage

```bash
rounded-ass subtitle-file.srt [video-file] [options]
```

or

```bash
rounded-ass subtitle-file.vtt [video-file] [options]
```

### Options

```
-o, --output <file>        Output ASS file
-f, --font <name>          Font name (autodetermined if not specified)
-s, --font-size <size>     Font size (default: 48)
--text-color <hex>         Text color in hex (default: FFFFFF)
--bg-color <hex>           Background color in hex (default: 000000)
--opacity <value>          Background opacity 0-255 (default: 0)
--padding-x <px>           Horizontal padding (default: 20)
--padding-y <px>           Vertical padding (default: 10)
--radius <px>              Border radius (autodetermined if not specified)
--width-ratio <ratio>      Width adjustment ratio (default: 1.0)
--margin-bottom <px>       Bottom margin (autodetermined if not specified)
-v, --verbose              Enable verbose logging
```

## API Usage

```javascript
const { createRoundedAss, parseSubtitles } = require('rounded-ass');

// Generate ASS subtitles
createRoundedAss('subtitles.srt', 'video.mp4', 'output.ass', {
  font: 'Arial',
  fontSize: 48,
  textColor: 'FFFFFF',
  bgColor: '000000',
  opacity: 80,
  paddingX: 20,
  paddingY: 10,
  radius: 10,
  verbose: true,
  subtitleFormat: 'srt' // or 'vtt'
});

// Parse subtitle file
const subtitles = parseSubtitles('subtitles.vtt', 'vtt');
```

## License

MIT
