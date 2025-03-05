const fs = require('fs-extra');
const path = require('path');
const subtitle = require('subtitle');

/**
 * Utility logger that respects verbose mode
 */
class Logger {
    constructor(verbose = false) {
        this.verbose = verbose;
    }

    log(message) {
        if (this.verbose) {
            console.log(message);
        }
    }

    warn(message) {
        // Always show warnings in non-verbose mode, but prefix differently
        if (this.verbose) {
            console.warn(`Warning: ${message}`);
        } else {
            console.warn(message);
        }
    }

    error(message) {
        // Always show errors
        console.error(message);
    }

    // Special method for important info that should always be shown
    info(message) {
        console.log(message);
    }
}

async function createRoundedAss(subtitlePath, videoPath, outputPath, options = {}) {
    // Initialize logger with verbose setting
    const logger = new Logger(options.verbose);

    // Log the options passed in when in verbose mode
    if (options.verbose) {
        logger.log('Options passed to createRoundedAss:');
        logger.log(JSON.stringify(options, null, 2));
    }

    const config = {
        videoPath,
        font: options.font || 'Arial',
        fontSize: options.fontSize || 48,
        textColor: options.textColor || 'FFFFFF',
        bgColor: options.bgColor || '000000',
        bgAlpha: options.opacity || 0,
        paddingX: options.paddingX || 20,
        paddingY: options.paddingY || 10,
        radius: options.radius,
        widthRatio: options.widthRatio || 1.0,
        marginBottom: options.marginBottom,
        subtitleFormat: options.subtitleFormat || 'srt' // Default to SRT if not specified
    };

    // Log which options are using defaults vs specified values
    if (options.verbose) {
        logger.log('Configuration settings:');
        logger.log(`- Font: ${options.font ? `"${config.font}" (user specified)` : `"${config.font}" (default)`}`);
        logger.log(`- Font size: ${options.fontSize ? `${config.fontSize}px (user specified)` : `${config.fontSize}px (default)`}`);
        logger.log(`- Text color: #${options.textColor ? `${config.textColor} (user specified)` : `${config.textColor} (default)`}`);
        logger.log(`- Background color: #${options.bgColor ? `${config.bgColor} (user specified)` : `${config.bgColor} (default)`}`);
        logger.log(`- Background opacity: ${options.opacity !== undefined ? `${config.bgAlpha} (user specified)` : `${config.bgAlpha} (default)`}`);
        logger.log(`- Horizontal padding: ${options.paddingX ? `${config.paddingX}px (user specified)` : `${config.paddingX}px (default)`}`);
        logger.log(`- Vertical padding: ${options.paddingY ? `${config.paddingY}px (user specified)` : `${config.paddingY}px (default)`}`);
        logger.log(`- Border radius: ${options.radius !== undefined ? `${config.radius}px (user specified)` : 'auto (will be determined)'}`);
        logger.log(`- Width ratio: ${options.widthRatio ? `${config.widthRatio} (user specified)` : `${config.widthRatio} (default)`}`);
        logger.log(`- Bottom margin: ${options.marginBottom !== undefined ? `${config.marginBottom}px (user specified)` : 'auto (will be determined)'}`);
        logger.log(`- Subtitle format: ${config.subtitleFormat}`);
    }

    // Implementation of rounded ASS subtitle generation
    try {
        const fs = require('fs-extra');
        const path = require('path');
        const iconv = require('iconv-lite');
        const os = require('os');
        const measureDimensions = require('ass-measure');

        // Parse subtitle file (SRT or VTT)
        logger.log(`Parsing ${config.subtitleFormat.toUpperCase()} file: ${subtitlePath}`);
        const subtitles = parseSubtitles(subtitlePath, config.subtitleFormat, logger);
        if (!subtitles.length) {
            throw new Error(`No subtitles found in the ${config.subtitleFormat.toUpperCase()} file`);
        }

        logger.log(`Parsed ${subtitles.length} subtitles from ${subtitlePath}`);

        // Get video dimensions (fallback to defaults)
        let videoWidth = 1920;
        let videoHeight = 1080;

        // If videoPath is provided, get actual dimensions
        if (videoPath) {
            try {
                const dimensions = await getVideoDimensions(videoPath, logger);
                if (dimensions) {
                    videoWidth = dimensions.width;
                    videoHeight = dimensions.height;
                    logger.log(`Video dimensions: ${videoWidth}x${videoHeight}`);
                }
            } catch (error) {
                logger.warn(`Could not get video dimensions: ${error.message}`);
                logger.warn('Using default dimensions: 1920x1080');
            }
        }

        // Extended configuration with additional options
        const extendedConfig = {
            ...config,
            bgAlpha: options.bgAlpha || config.bgAlpha || 80, // 0-255
            paddingV: config.paddingY,
            paddingH: config.paddingX,
            minWidthRatio: options.minWidthRatio || 0.0,
            maxWidthRatio: options.maxWidthRatio || 1,
            lineSpacing: options.lineSpacing || 1.2,
            fontName: config.font,
            widthCorrection: options.widthCorrection || 0.95,
            tightFit: options.tightFit !== undefined ? options.tightFit : true,
            disableMinWidth: options.disableMinWidth !== undefined ? options.disableMinWidth : true,
            useAssMeasure: options.useAssMeasure !== undefined ? options.useAssMeasure : true
        };

        // Log extended configuration if in verbose mode
        if (options.verbose) {
            logger.log('Extended configuration:');
            logger.log(`- Background alpha: ${extendedConfig.bgAlpha}`);
            logger.log(`- Min width ratio: ${extendedConfig.minWidthRatio}`);
            logger.log(`- Max width ratio: ${extendedConfig.maxWidthRatio}`);
            logger.log(`- Line spacing: ${extendedConfig.lineSpacing}`);
            logger.log(`- Width correction: ${extendedConfig.widthCorrection}`);
            logger.log(`- Tight fit: ${extendedConfig.tightFit}`);
            logger.log(`- Disable min width: ${extendedConfig.disableMinWidth}`);
            logger.log(`- Use ASS measure: ${extendedConfig.useAssMeasure}`);
        }

        // Calculate font size based on video height
        const fontSize = config.fontSize || Math.floor(videoHeight / 20);

        // Determine minimum and maximum box width based on video width
        const minWidth = extendedConfig.disableMinWidth ? 0 : videoWidth * extendedConfig.minWidthRatio;
        const maxWidth = videoWidth * extendedConfig.maxWidthRatio;

        // Determine predominant script from all subtitles
        const allText = subtitles.map(sub => sub.text).join(' ');
        const predominantScript = detectScript(allText);
        logger.log(`Detected predominant script: ${predominantScript}`);

        // Adjust font for script if needed (auto-determination with override capability)
        let fontName = extendedConfig.fontName;
        let fontSource = "default";

        // Only auto-determine font if one wasn't explicitly specified in options
        if (!options.font) {
            if (predominantScript === 'cjk') {
                if (process.platform === 'win32') { // Windows
                    fontName = 'Microsoft YaHei';
                } else { // macOS, Linux
                    fontName = 'Noto Sans CJK SC';
                }
                fontSource = "auto-determined for CJK script";
            } else if (predominantScript === 'arabic') {
                fontName = process.platform === 'win32' ? 'Traditional Arabic' : 'Noto Sans Arabic';
                fontSource = "auto-determined for Arabic script";
            } else if (predominantScript === 'hebrew') {
                fontName = process.platform === 'win32' ? 'David' : 'Noto Sans Hebrew';
                fontSource = "auto-determined for Hebrew script";
            }
        } else {
            fontSource = "user specified";
        }

        // Log the font info with more details
        logger.log(`Using font: "${fontName}" (${fontSource})`);

        // Auto-determine or use specified bottom margin
        const marginBottom = determineBottomMargin(options.marginBottom, videoHeight);
        logger.log(`Using bottom margin: ${marginBottom}px${options.marginBottom !== undefined ? ' (user specified)' : ' (auto-determined)'}`);

        // Create ASS header with styles
        let assContent = createAssHeader(
            videoWidth,
            videoHeight,
            predominantScript,
            fontName,
            fontSize,
            marginBottom,
            extendedConfig.bgColor,
            extendedConfig.textColor
        );

        // Use ass-measure to get accurate subtitle dimensions
        let subtitleDimensions = null;
        if (extendedConfig.useAssMeasure) {
            logger.log('Using ass-measure for accurate subtitle dimensions');
            // Create a temporary ASS file for measurement
            const tempAssFile = createTemporaryAssFile(subtitles, fontName, fontSize, videoWidth, videoHeight);
            // Measure subtitle dimensions
            subtitleDimensions = measureSubtitleDimensions(tempAssFile, videoWidth, videoHeight);
            // Clean up temporary file
            fs.removeSync(tempAssFile);
        }

        // Generate event lines for each subtitle
        const events = [];

        // Track dimension stats for summary
        let measuredCount = 0;
        let estimatedCount = 0;

        for (let idx = 0; idx < subtitles.length; idx++) {
            const sub = subtitles[idx];
            const startTime = formatAssTime(sub.start);
            const endTime = formatAssTime(sub.end);

            // Calculate position for both text and box
            const yPos = videoHeight - marginBottom;

            // Detect script for this specific subtitle
            const textScript = detectScript(sub.text);

            // Calculate box dimensions using ass-measure results if available
            let textWidth, textHeight;

            if (subtitleDimensions && idx < subtitleDimensions.length) {
                // Use the accurate dimensions from ass-measure
                textWidth = subtitleDimensions[idx].width;
                textHeight = subtitleDimensions[idx].height;
                measuredCount++;
                // Only log details for the first few subtitles if in verbose mode
                if (options.verbose && idx < 3) {
                    logger.log(`Subtitle #${idx + 1}: Using measured dimensions: ${textWidth}x${textHeight}`);
                }
            } else {
                // Fallback to estimation if ass-measure fails
                const estimation = calculateTextDimensions(sub.text, fontName, fontSize, videoWidth);
                textWidth = estimation.width;
                textHeight = estimation.height;
                estimatedCount++;
                // Only log details for the first few subtitles if in verbose mode
                if (options.verbose && idx < 3) {
                    logger.log(`Subtitle #${idx + 1}: Using estimated dimensions: ${textWidth}x${textHeight}`);
                }
            }

            // Add padding to dimensions with special handling for zero padding case
            let boxWidth;
            if (extendedConfig.paddingH === 0) {
                // When paddingH is exactly 0, use minimal padding to ensure text fits
                boxWidth = textWidth + 2; // Just add 2 pixels total
            } else {
                // Otherwise use the specified padding
                boxWidth = textWidth + (extendedConfig.paddingH * 2);
            }

            // Vertical padding is always applied
            const boxHeight = textHeight + (extendedConfig.paddingV * 2);

            // Ensure box width doesn't exceed video width
            boxWidth = Math.min(boxWidth, videoWidth * 0.98); // Leave a small margin

            // Apply minimum width constraint only if enabled
            if (!extendedConfig.disableMinWidth) {
                boxWidth = Math.max(boxWidth, minWidth);
            }

            // Apply video-relative maximum width
            boxWidth = Math.min(boxWidth, maxWidth);

            // Half dimensions for drawing
            const halfWidth = boxWidth / 2;
            const halfHeight = boxHeight / 2;

            // Auto-determine or use specified border radius
            const effectiveBorderRadius = determineBorderRadius(
                options.radius,
                halfWidth,
                halfHeight,
                videoWidth,
                videoHeight
            );

            // Log the effective border radius if in verbose mode and it's the first subtitle
            if (options.verbose && idx === 0) {
                logger.log(`Using border radius: ${effectiveBorderRadius}px${options.radius !== undefined ? ' (user specified)' : ' (auto-determined)'}`);
            }

            // Background on layer 0 using Box-BG style with top-left alignment (7)
            const bgAlphaHex = extendedConfig.bgAlpha.toString(16).padStart(2, '0');
            let bg = `0,${startTime},${endTime},Box-BG,,0,0,0,,{\\pos(${videoWidth / 2},${yPos})\\bord0\\shad0\\1c&H${extendedConfig.bgColor}\\1a&H${bgAlphaHex}\\p1}`;

            // Generate the rounded rectangle drawing with the effective border radius
            bg += generateRoundedRectDrawing(halfWidth, halfHeight, effectiveBorderRadius);
            bg += "{\\p0}";

            // Add RTL marker for RTL script if different from predominant script
            const currentRtlMarker = isRtlScript(textScript) ? '\\u+F220' : '';

            // Text on layer 1 with center alignment (5) for both horizontal and vertical centering
            const text = `1,${startTime},${endTime},Default,,0,0,0,,{\\an5\\pos(${videoWidth / 2},${yPos})\\bord0\\shad0}${currentRtlMarker}${sub.text}`;

            events.push("Dialogue: " + bg);
            events.push("Dialogue: " + text);
        }

        // Add events to ASS content
        assContent += events.join('\n') + '\n';

        // Log dimension stats summary
        logger.log(`Subtitle dimensions: ${measuredCount} measured, ${estimatedCount} estimated`);

        // Write ASS file
        fs.writeFileSync(outputPath, assContent, 'utf8');
        logger.info(`ASS file generated: ${outputPath}`);

        return outputPath;
    } catch (error) {
        logger.error(`Error generating subtitles: ${error.message}`);
        throw error;
    }
}

/**
 * Parse subtitle file (SRT or VTT) and return standardized subtitle objects
 * 
 * @param {string} filePath - Path to the subtitle file
 * @param {string} format - 'srt' or 'vtt'
 * @param {Logger} logger - Logger instance
 * @returns {Array} - Array of subtitle objects with time in seconds
 */
function parseSubtitles(filePath, format, logger = new Logger()) {
    try {
        // Read the file
        const fs = require('fs-extra');
        const iconv = require('iconv-lite');

        const buffer = fs.readFileSync(filePath);
        let content;

        try {
            content = iconv.decode(buffer, 'utf-8');
        } catch (error) {
            // Try Latin-1 if UTF-8 fails
            try {
                content = iconv.decode(buffer, 'latin1');
                logger.warn(`Subtitle file not in UTF-8 format. Using Latin-1 encoding.`);
            } catch (error) {
                // Try CP1252 as a last resort
                content = iconv.decode(buffer, 'cp1252');
                logger.warn(`Subtitle file not in UTF-8 format. Using CP1252 encoding.`);
            }
        }

        // Parse using subtitle library
        let parsedSubtitles = [];

        try {
            logger.log(`Parsing as ${format.toUpperCase()} format`);
            const parsed = subtitle.parseSync(content);

            // Filter only the cue entries
            parsedSubtitles = parsed.filter(item => item.type === 'cue').map(item => item.data);

            logger.log(`Found ${parsedSubtitles.length} subtitle entries`);

            if (parsedSubtitles.length === 0) {
                logger.warn('No subtitle entries found. This might indicate a parsing issue.');
            }
        } catch (error) {
            logger.error(`Error parsing subtitle content: ${error.message}`);
            throw error;
        }

        // Convert to our internal format
        const subtitles = parsedSubtitles.map((sub, index) => {
            let text = typeof sub.text === 'string' ? sub.text :
                (sub.text ? sub.text.toString() : '');

            return {
                index: index + 1,
                start: sub.start / 1000, // Convert from ms to seconds
                end: sub.end / 1000,     // Convert from ms to seconds
                text: text.replace(/\n/g, '\\N') // Handle line breaks
            };
        });

        // Fix timing to prevent flickering
        for (let i = 0; i < subtitles.length - 1; i++) {
            const currentSub = subtitles[i];
            const nextSub = subtitles[i + 1];

            // If the gap is small (less than 0.1s), make end time of current = start time of next
            if (nextSub.start - currentSub.end < 0.1) {
                currentSub.end = nextSub.start;
            }
        }

        return subtitles;
    } catch (error) {
        logger.error(`Error reading/parsing subtitle file: ${error.message}`);
        throw error;
    }
}

// Keep the parseSRT for backward compatibility, but have it call our new unified parser
function parseSRT(srtPath, logger = new Logger()) {
    return parseSubtitles(srtPath, 'srt', logger);
}

/**
 * Format seconds to ASS time format.
 * 
 * @param {number} seconds - Time in seconds
 * @returns {string} - ASS format time (H:MM:SS.ss)
 */
function formatAssTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
}

/**
 * Generate a rounded rectangle drawing command for ASS subtitles.
 * 
 * @param {number} halfWidth - Half width of the rectangle
 * @param {number} halfHeight - Half height of the rectangle
 * @param {number} borderRadius - Corner radius
 * @returns {string} - ASS drawing commands for a rounded rectangle
 */
function generateRoundedRectDrawing(halfWidth, halfHeight, borderRadius) {
    let drawing = '';

    // Ensure border radius is not larger than the dimensions of the box
    const maxAllowedRadius = Math.max(1, Math.min(halfHeight, halfWidth) - 1);
    const effectiveBorderRadius = borderRadius > 0 ? Math.min(borderRadius, maxAllowedRadius) : 0;

    if (effectiveBorderRadius > 0) {
        // Draw a rounded rectangle using bezier curves for corners
        // Start at top-left + radius, going clockwise
        drawing += `m ${-halfWidth + effectiveBorderRadius} ${-halfHeight} `; // Starting point
        drawing += `l ${halfWidth - effectiveBorderRadius} ${-halfHeight} `; // Top edge

        // Top-right corner with bezier
        drawing += `b ${halfWidth} ${-halfHeight} ${halfWidth} ${-halfHeight + effectiveBorderRadius} ${halfWidth} ${-halfHeight + effectiveBorderRadius} `;

        drawing += `l ${halfWidth} ${halfHeight - effectiveBorderRadius} `; // Right edge

        // Bottom-right corner
        drawing += `b ${halfWidth} ${halfHeight} ${halfWidth - effectiveBorderRadius} ${halfHeight} ${halfWidth - effectiveBorderRadius} ${halfHeight} `;

        // Bottom edge
        drawing += `l ${-halfWidth + effectiveBorderRadius} ${halfHeight} `;

        // Bottom-left corner
        drawing += `b ${-halfWidth} ${halfHeight} ${-halfWidth} ${halfHeight - effectiveBorderRadius} ${-halfWidth} ${halfHeight - effectiveBorderRadius} `;

        drawing += `l ${-halfWidth} ${-halfHeight + effectiveBorderRadius} `; // Left edge

        // Top-left corner
        drawing += `b ${-halfWidth} ${-halfHeight} ${-halfWidth + effectiveBorderRadius} ${-halfHeight} ${-halfWidth + effectiveBorderRadius} ${-halfHeight} `;
    } else {
        // Simple rectangle without rounded corners
        drawing += `m ${-halfWidth} ${-halfHeight} `; // Top-left
        drawing += `l ${halfWidth} ${-halfHeight} `; // Top-right
        drawing += `l ${halfWidth} ${halfHeight} `; // Bottom-right
        drawing += `l ${-halfWidth} ${halfHeight} `; // Bottom-left
        drawing += `l ${-halfWidth} ${-halfHeight} `; // Back to top-left
    }

    return drawing;
}

/**
 * Creates a temporary ASS file for measuring dimensions
 * 
 * @param {Array} subtitles - Array of subtitles 
 * @param {string} fontName - Font name
 * @param {number} fontSize - Font size
 * @param {number} videoWidth - Video width
 * @param {number} videoHeight - Video height
 * @returns {string} - Path to created temporary ASS file
 */
function createTemporaryAssFile(subtitles, fontName, fontSize, videoWidth, videoHeight) {
    const fs = require('fs-extra');
    const path = require('path');
    const os = require('os');

    const tempFilePath = path.join(os.tmpdir(), `temp-${Date.now()}.ass`);

    // Create a basic ASS file with just the subtitles in the Default style
    let assContent = `[Script Info]
Title: Temporary ASS file for measurement
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // Add each subtitle as a dialogue line
    subtitles.forEach((sub, index) => {
        const startTime = formatAssTime(sub.start);
        const endTime = formatAssTime(sub.end);
        assContent += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${sub.text}\n`;
    });

    // Write the file
    fs.writeFileSync(tempFilePath, assContent, 'utf8');

    return tempFilePath;
}

/**
 * Measure subtitle dimensions using the ass-measure library
 * 
 * @param {string} assFilePath - Path to ASS file
 * @param {number} videoWidth - Video width
 * @param {number} videoHeight - Video height
 * @param {Logger} logger - Logger instance
 * @returns {Array} - Array of subtitle dimensions
 */
function measureSubtitleDimensions(assFilePath, videoWidth, videoHeight, logger = new Logger()) {
    try {
        const measureDimensions = require('ass-measure');

        // Use the Node.js addon
        const result = measureDimensions(assFilePath, videoWidth, videoHeight);

        // Convert the result to match the expected format 
        return result.map((line, index) => ({
            index,
            text: line.text,
            width: line.width,
            height: line.height
        }));
    } catch (error) {
        logger.error(`Error measuring subtitle dimensions: ${error.message}`);
        // Return null to allow fallback to estimation
        logger.warn('Falling back to text dimension estimation.');
        return null;
    }
}

/**
 * SSA/ASS header template
 * 
 * @param {number} videoWidth - Video width
 * @param {number} videoHeight - Video height 
 * @param {string} predominantScript - Detected script
 * @param {string} fontName - Font name
 * @param {number} fontSize - Font size
 * @param {number} marginBottom - Bottom margin
 * @param {string} bgColor - Background color hex
 * @param {string} textColor - Text color hex
 * @returns {string} - ASS header content
 */
function createAssHeader(videoWidth, videoHeight, predominantScript, fontName, fontSize, marginBottom, bgColor, textColor) {
    return `[Script Info]
Title: ASS subtitles with rounded background boxes
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 0
ScaledBorderAndShadow: yes
Language: ${predominantScript}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},&H00${textColor},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,10,10,${marginBottom},1
Style: Box-BG,${fontName},${fontSize / 2},&H00${bgColor},&H000000FF,&H00${bgColor},&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

/**
 * Detect script type from text
 * 
 * @param {string} text - Text to analyze
 * @returns {string} - Detected script code
 */
function detectScript(text) {
    // Simple script detection logic
    // Check for CJK characters (Chinese, Japanese, Korean)
    if (/[\u3000-\u9fff\uf900-\ufaff]/.test(text)) {
        return 'cjk';
    }

    // Check for Arabic characters
    if (/[\u0600-\u06FF]/.test(text)) {
        return 'arabic';
    }

    // Check for Hebrew characters
    if (/[\u0590-\u05FF]/.test(text)) {
        return 'hebrew';
    }

    // Default to Latin
    return 'latin';
}

/**
 * Check if script is right-to-left
 * 
 * @param {string} script - Script code
 * @returns {boolean} - True if RTL
 */
function isRtlScript(script) {
    return ['arabic', 'hebrew'].includes(script);
}

/**
 * Calculate text dimensions based on font and size
 * 
 * @param {string} text - Text to measure
 * @param {string} fontName - Font name
 * @param {number} fontSize - Font size
 * @param {number} videoWidth - Video width for constraint
 * @returns {Object} - Width and height of text
 */
function calculateTextDimensions(text, fontName, fontSize, videoWidth) {
    // Simple estimation algorithm
    // Remove ASS tags for estimation
    const cleanText = text.replace(/\{.*?\}/g, '').replace(/\\N/g, ' ');

    // Estimate width based on character count and font size
    // This is a rough estimation
    const charWidth = fontSize * 0.6; // Approximate width per character
    const estimatedWidth = Math.min(cleanText.length * charWidth, videoWidth * 0.9);

    // Estimate height based on font size and line count
    const lineCount = (text.match(/\\N/g) || []).length + 1;
    const lineHeight = fontSize * 1.2; // Line height with spacing
    const estimatedHeight = lineHeight * lineCount;

    return {
        width: estimatedWidth,
        height: estimatedHeight
    };
}

/**
 * Get video dimensions using ffprobe
 * 
 * @param {string} videoPath - Path to video file
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} - Video width and height
 */
async function getVideoDimensions(videoPath, logger = new Logger()) {
    try {
        const { execSync } = require('child_process');

        // Use ffprobe to get video dimensions
        const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`;
        const result = execSync(cmd, { encoding: 'utf8' }).trim();

        const [width, height] = result.split('x').map(Number);

        if (isNaN(width) || isNaN(height)) {
            throw new Error('Could not parse video dimensions');
        }

        return { width, height };
    } catch (error) {
        logger.error(`Error getting video dimensions: ${error.message}`);
        return null;
    }
}

/**
 * Auto-determine or use specified border radius
 * 
 * @param {number|undefined} specifiedRadius - User specified radius (if any)
 * @param {number} halfWidth - Half width of the subtitle box
 * @param {number} halfHeight - Half height of the subtitle box
 * @param {number} videoWidth - Video width
 * @param {number} videoHeight - Video height
 * @returns {number} - Effective border radius to use
 */
function determineBorderRadius(specifiedRadius, halfWidth, halfHeight, videoWidth, videoHeight) {
    // If user specified a radius, respect that (with safety limits)
    if (specifiedRadius !== undefined) {
        const maxAllowedRadius = Math.max(1, Math.min(halfHeight, halfWidth) - 1);
        return specifiedRadius > 0 ? Math.min(specifiedRadius, maxAllowedRadius) : 0;
    }

    // Auto-determine based on box and video dimensions
    // Calculate a reasonable radius based on subtitle box size
    const smallerDimension = Math.min(halfWidth, halfHeight);

    // Scale the radius based on both box size and video dimensions
    // Higher resolution videos can have larger radii
    const videoScale = Math.min(videoWidth, videoHeight) / 1080; // normalize to 1080p
    const baseRadius = Math.min(10 * videoScale, smallerDimension / 4);

    // Ensure we don't go beyond what's allowed for the box
    const maxAllowedRadius = Math.max(1, smallerDimension - 1);
    return Math.min(baseRadius, maxAllowedRadius);
}

/**
 * Auto-determine or use specified bottom margin
 * 
 * @param {number|undefined} specifiedMargin - User specified margin (if any)
 * @param {number} videoHeight - Video height
 * @returns {number} - Effective margin to use
 */
function determineBottomMargin(specifiedMargin, videoHeight) {
    // If user specified a margin, respect that
    if (specifiedMargin !== undefined) {
        return specifiedMargin;
    }

    // Auto-determine based on video height
    // For higher resolutions, use a proportionally larger margin
    const baseMargin = Math.floor(videoHeight * 0.05); // 5% of video height

    // Ensure it's at least 30px for readability, but not more than 10% of video height
    return Math.max(60, Math.min(baseMargin, Math.floor(videoHeight * 0.1)));
}

module.exports = {
    createRoundedAss,
    determineBorderRadius,
    determineBottomMargin,
    parseSubtitles,
    Logger
};

