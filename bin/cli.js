#!/usr/bin/env node
const { program } = require('commander');
const path = require('path');
const { createRoundedAss } = require('../lib/roundedAss');
const packageInfo = require('../package.json');

program
    .name('rounded-ass')
    .description('Generate ASS subtitles with rounded backgrounds from SRT files')
    .version(packageInfo.version)
    .argument('<srt-file>', 'Input SRT subtitle file')
    .argument('[video-file]', 'Optional video file for dimension detection')
    .option('-o, --output <file>', 'Output ASS file')
    .option('-f, --font <name>', 'Font name', 'Arial')
    .option('-s, --font-size <size>', 'Font size', parseInt, 48)
    .option('--text-color <hex>', 'Text color in hex', 'FFFFFF')
    .option('--bg-color <hex>', 'Background color in hex', '000000')
    .option('--opacity <value>', 'Background opacity (0-255)', parseInt, 0)
    .option('--padding-x <px>', 'Horizontal padding', parseInt, 20)
    .option('--padding-y <px>', 'Vertical padding', parseInt, 10)
    .option('--radius <px>', 'Border radius', parseInt, 10)
    .option('--width-ratio <ratio>', 'Width adjustment ratio', parseFloat, 1.0)
    .option('--margin-bottom <px>', 'Bottom margin', parseInt, 50)
    .parse(process.argv);

async function run() {
    const [srtFile, videoFile] = program.args;
    const opts = program.opts();

    let outputFile = opts.output;
    if (!outputFile) {
        const basename = path.basename(srtFile, path.extname(srtFile));
        outputFile = `${basename}.ass`;
    }

    try {
        await createRoundedAss(srtFile, videoFile, outputFile, opts);
        console.log(`ASS file created: ${outputFile}`);
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
}

run();

