const fs = require('fs-extra');
const path = require('path');

async function createRoundedAss(srtPath, videoPath, outputPath, options = {}) {
    const config = {
        videoPath,
        font: options.font || 'Arial',
        fontSize: options.fontSize || 48,
        textColor: options.textColor || 'FFFFFF',
        bgColor: options.bgColor || '000000',
        bgAlpha: options.opacity || 0,
        paddingX: options.paddingX || 20,
        paddingY: options.paddingY || 10,
        radius: options.radius || 10,
        widthRatio: options.widthRatio || 1.0,
        marginBottom: options.marginBottom || 50
    };

    // Implementation of rounded ASS subtitle generation
    try {
        const fs = require('fs-extra');
        const path = require('path');
        const iconv = require('iconv-lite');
        const os = require('os');
        const measureDimensions = require('ass-measure');

        // Parse SRT file
        console.log(`Parsing SRT file: ${srtPath}`);
        const subtitles = parseSRT(srtPath);
        if (!subtitles.length) {
            throw new Error('No subtitles found in the SRT file');
        }

        console.log(`Parsed ${subtitles.length} subtitles from ${srtPath}`);

        // Get video dimensions (fallback to defaults)
        let videoWidth = 1920;
        let videoHeight = 1080;

        // If videoPath is provided, get actual dimensions
        if (videoPath) {
            try {
                const dimensions = await getVideoDimensions(videoPath);
                if (dimensions) {
                    videoWidth = dimensions.width;
                    videoHeight = dimensions.height;
                    console.log(`Video dimensions: ${videoWidth}x${videoHeight}`);
                }
            } catch (error) {
                console.warn(`Warning: Could not get video dimensions: ${error.message}`);
                console.warn('Using default dimensions: 1920x1080');
            }
        }

        // Extended configuration with additional options
        const extendedConfig = {
            ...config,
            bgAlpha: options.bgAlpha || config.bgAlpha || 80, // 0-255
            paddingV: config.paddingY,
            paddingH: config.paddingX,
            minWidthRatio: options.minWidthRatio || 0.0,
            maxWidthRatio: options.maxWidthRatio || 0.9,
            lineSpacing: options.lineSpacing || 1.2,
            fontName: config.font,
            widthCorrection: options.widthCorrection || 0.95,
            tightFit: options.tightFit !== undefined ? options.tightFit : true,
            disableMinWidth: options.disableMinWidth !== undefined ? options.disableMinWidth : true,
            useAssMeasure: options.useAssMeasure !== undefined ? options.useAssMeasure : true
        };

        // Calculate font size based on video height
        const fontSize = config.fontSize || Math.floor(videoHeight / 20);

        // Determine minimum and maximum box width based on video width
        const minWidth = extendedConfig.disableMinWidth ? 0 : videoWidth * extendedConfig.minWidthRatio;
        const maxWidth = videoWidth * extendedConfig.maxWidthRatio;

        // Determine predominant script from all subtitles
        const allText = subtitles.map(sub => sub.text).join(' ');
        const predominantScript = detectScript(allText);
        console.log(`Detected predominant script: ${predominantScript}`);

        // Adjust font for script if needed
        let fontName = extendedConfig.fontName;
        if (predominantScript === 'cjk' && fontName === 'Arial') {
            if (process.platform === 'win32') { // Windows
                fontName = 'Microsoft YaHei';
            } else { // macOS, Linux
                fontName = 'Noto Sans CJK SC';
            }
            console.log(`Automatically selected font for CJK script: ${fontName}`);
        }

        // Create ASS header with styles
        let assContent = createAssHeader(
            videoWidth,
            videoHeight,
            predominantScript,
            fontName,
            fontSize,
            extendedConfig.marginBottom,
            extendedConfig.bgColor,
            extendedConfig.textColor
        );

        // Use ass-measure to get accurate subtitle dimensions
        let subtitleDimensions = null;
        if (extendedConfig.useAssMeasure) {
            console.log('Using ass-measure for accurate subtitle dimensions');
            // Create a temporary ASS file for measurement
            const tempAssFile = createTemporaryAssFile(subtitles, fontName, fontSize, videoWidth, videoHeight);
            // Measure subtitle dimensions
            subtitleDimensions = measureSubtitleDimensions(tempAssFile, videoWidth, videoHeight);
            // Clean up temporary file
            fs.removeSync(tempAssFile);
        }

        // Generate event lines for each subtitle
        const events = [];

        for (let idx = 0; idx < subtitles.length; idx++) {
            const sub = subtitles[idx];
            const startTime = formatAssTime(sub.start);
            const endTime = formatAssTime(sub.end);

            // Calculate position for both text and box
            const yPos = videoHeight - extendedConfig.marginBottom;

            // Detect script for this specific subtitle
            const textScript = detectScript(sub.text);

            // Calculate box dimensions using ass-measure results if available
            let textWidth, textHeight;

            if (subtitleDimensions && idx < subtitleDimensions.length) {
                // Use the accurate dimensions from ass-measure
                textWidth = subtitleDimensions[idx].width;
                textHeight = subtitleDimensions[idx].height;
                console.log(`Using measured dimensions for line ${idx + 1}: ${textWidth}x${textHeight}`);
            } else {
                // Fallback to estimation if ass-measure fails
                const estimation = calculateTextDimensions(sub.text, fontName, fontSize, videoWidth);
                textWidth = estimation.width;
                textHeight = estimation.height;
                console.log(`Using estimated dimensions for line ${idx + 1}: ${textWidth}x${textHeight}`);
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

            // Check if we need to adjust border radius
            const maxAllowedRadius = Math.max(1, Math.min(halfHeight, halfWidth) - 1);
            const originalBorderRadius = extendedConfig.radius;
            const effectiveBorderRadius = originalBorderRadius > 0 ? Math.min(originalBorderRadius, maxAllowedRadius) : 0;

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

        // Write ASS file
        fs.writeFileSync(outputPath, assContent, 'utf8');
        console.log(`ASS file generated: ${outputPath}`);

        return outputPath;
    } catch (error) {
        console.error(`Error generating subtitles: ${error.message}`);
        throw error;
    }
}

/**
 * Parse SRT file with encoding detection and return subtitles.
 * 
 * @param {string} srtPath - Path to the SRT file
 * @returns {Array} - Array of subtitle objects with time in seconds
 */
function parseSRT(srtPath) {
    const fs = require('fs-extra');
    const iconv = require('iconv-lite');
    
    // Try to detect encoding and read file
    let content;
    try {
        const buffer = fs.readFileSync(srtPath);
        try {
            content = iconv.decode(buffer, 'utf-8');
        } catch (error) {
            // Try Latin-1 if UTF-8 fails
            try {
                content = iconv.decode(buffer, 'latin1');
                console.warn("Warning: SRT file not in UTF-8 format. Using Latin-1 encoding.");
            } catch (error) {
                // Try CP1252 as a last resort
                content = iconv.decode(buffer, 'cp1252');
                console.warn("Warning: SRT file not in UTF-8 format. Using CP1252 encoding.");
            }
        }
    } catch (error) {
        console.error(`Error reading SRT file: ${error.message}`);
        throw error;
    }

    // Regular expression to match SRT entries
    const pattern = /(\d+)\s+(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})\s+([\s\S]*?)(?=\n\d+\s+|$)/g;

    const subtitles = [];
    let match;

    while ((match = pattern.exec(content)) !== null) {
        const [, index, startTime, endTime, text] = match;

        subtitles.push({
            index: parseInt(index),
            start: parseSrtTime(startTime),
            end: parseSrtTime(endTime),
            text: text.trim().replace(/\n/g, '\\N')
        });
    }

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
}

/**
 * Convert SRT time string to seconds.
 * 
 * @param {string} timeStr - SRT format timestamp (HH:MM:SS,mmm)
 * @returns {number} - Time in seconds
 */
function parseSrtTime(timeStr) {
    const timeComponents = timeStr.replace(',', '.').split(':');
    const hours = parseFloat(timeComponents[0]);
    const minutes = parseFloat(timeComponents[1]);
    const seconds = parseFloat(timeComponents[2]);

    return hours * 3600 + minutes * 60 + seconds;
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
 * @returns {Array} - Array of subtitle dimensions
 */
function measureSubtitleDimensions(assFilePath, videoWidth, videoHeight) {
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
        console.error(`Error measuring subtitle dimensions: ${error.message}`);
        // Return null to allow fallback to estimation
        console.warn('Falling back to text dimension estimation.');
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
 * @returns {Promise<Object>} - Video width and height
 */
async function getVideoDimensions(videoPath) {
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
        console.error(`Error getting video dimensions: ${error.message}`);
        return null;
    }
}

module.exports = { createRoundedAss };

