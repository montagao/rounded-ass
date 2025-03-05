#!/usr/bin/env node
const { program } = require('commander');
const path = require('path');
const { createRoundedAss } = require('../lib/roundedAss');
const packageInfo = require('../package.json');

program
    .name('rounded-ass')
    .description('Generate ASS subtitles with rounded backgrounds from SRT or VTT files')
    .version(packageInfo.version)
    .argument('<subtitle-file>', 'Input subtitle file (.srt or .vtt)')
    .argument('[video-file]', 'Optional video file for dimension detection')
    .option('-o, --output <file>', 'Output ASS file')
    .option('-f, --font <name>', 'Font name (autodetermined if not specified)')
    .option('-s, --font-size <size>', 'Font size', parseInt, 48)
    .option('--text-color <hex>', 'Text color in hex', 'FFFFFF')
    .option('--bg-color <hex>', 'Background color in hex', '000000')
    .option('--opacity <value>', 'Background opacity (0-255)', parseInt, 0)
    .option('--padding-x <px>', 'Horizontal padding', parseInt, 20)
    .option('--padding-y <px>', 'Vertical padding', parseInt, 10)
    .option('--radius <px>', 'Border radius (autodetermined if not specified)', parseInt)
    .option('--width-ratio <ratio>', 'Width adjustment ratio', parseFloat, 1.0)
    .option('--margin-bottom <px>', 'Bottom margin (autodetermined if not specified)', parseInt)
    .option('-v, --verbose', 'Enable verbose logging')
    .parse(process.argv);

async function run() {
    const [subtitleFile, videoFile] = program.args;
    const opts = program.opts();

    // Validate that the input file is .srt or .vtt
    const fileExt = path.extname(subtitleFile).toLowerCase();
    if (fileExt !== '.srt' && fileExt !== '.vtt') {
        console.error(`Error: Input file must be .srt or .vtt format. Got: ${fileExt}`);
        process.exit(1);
    }

    let outputFile = opts.output;
    if (!outputFile) {
        const basename = path.basename(subtitleFile, path.extname(subtitleFile));
        outputFile = `${basename}.ass`;
    }

    // Create a clean options object with only the specified options
    const options = {};
    
    // Only include options that were explicitly specified
    if (opts.font !== undefined) options.font = opts.font;
    if (opts.fontSize !== undefined) options.fontSize = opts.fontSize;
    if (opts.textColor !== undefined) options.textColor = opts.textColor;
    if (opts.bgColor !== undefined) options.bgColor = opts.bgColor;
    if (opts.opacity !== undefined) options.opacity = opts.opacity;
    if (opts.paddingX !== undefined) options.paddingX = opts.paddingX;
    if (opts.paddingY !== undefined) options.paddingY = opts.paddingY;
    if (opts.radius !== undefined) options.radius = opts.radius;
    if (opts.widthRatio !== undefined) options.widthRatio = opts.widthRatio;
    if (opts.marginBottom !== undefined) options.marginBottom = opts.marginBottom;
    
    // Pass the verbose flag
    options.verbose = !!opts.verbose;
    
    // Pass the subtitle format
    options.subtitleFormat = fileExt.slice(1); // Remove the dot from extension

    try {
        await createRoundedAss(subtitleFile, videoFile, outputFile, options);
        console.log(`ASS file created: ${outputFile}`);
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
}

run();

