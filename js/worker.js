// Canvas data grid
var settings, canvas;

// -----------------------------------------------------------------------------

// Get a pixel power value from the canvas data grid
function mapPixelPower(value) {
    return value * (settings.beamPower.max - settings.beamPower.min)
                 + settings.beamPower.min;
}

// Get a pixel power value from the canvas data grid
function getPixelPower(x, y, noMap) {
    if (x >= settings.imageSize.width) {
        throw new Error('Out of range: x = ' + x);
    }

    if (y >= settings.imageSize.height) {
        throw new Error('Out of range: y = ' + y);
    }

    // Target canvas data
    var gx   = parseInt(x / settings.bufferSize);
    var gy   = parseInt(y / settings.bufferSize);
    var data = canvas[gy][gx];

    // Adjuste x/y values
    gx && (x -= settings.bufferSize * gx);
    gy && (y -= settings.bufferSize * gy);

    // Pixel index
    var i = (y * (settings.imageSize.width * 4)) + (x * 4);

    // Gray value
    // http://www.tannerhelland.com/3643/grayscale-image-algorithm-vb6/
    //s = (data[i] * 0.2989) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
    //var gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
    //
    // // Reverse value [0 = black - 255 = white] => [0 = white - 255 = black]
    // gray = 255 - gray;
    //
    // // Scale value [0 - 255] => [0 - 1]
    // gray = gray / 255;
    //
    // return gray;

    var S = (255 - (data[i] + data[i + 1] + data[i + 2]) / 3) / 255;

    return noMap ? S : mapPixelPower(S);
}

// -----------------------------------------------------------------------------

// Find colored pixels range
function getPixelsRange(y, width) {
    var start = null;
    var end   = null;

    for (x = 0; x <= width; x++) {
        if (start === null && getPixelPower(x, y, true)) {
            start = x;
        }

        if (end === null && getPixelPower((width - x), y, true)) {
            end = (width - x);
        }

        if (start !== null && end !== null) {
            break;
        }
    }

    return { start: start, end: end, length: end - start };
}

// -----------------------------------------------------------------------------

// Process canvas grid
function rasterize() {
    // Vars...
    var x, rx, X, y, Y, s, S, text, range;

    var beam    = settings.beamSize;
    var offset  = beam * 1000 / 2000;
    var width   = settings.imageSize.width - 1;
    var height  = settings.imageSize.height - 1;
    var reverse = true;

    // For each image line
    for (y = height; y >= 0; y--) {
        // Reset gcode text
        text = [];

        // Reverse line
        reverse = !reverse;

        // Get non white pixels range
        if (settings.trimLine) {
            range = getPixelsRange(y, width);
        }
        else {
            range = { start: 0, end: width, length: width };
        }

        // Debug...
        //console.log(range);

        // First pixel position
        rx = range.start;

        // Set first pixel position
        X  = reverse ? (rx + range.length) : rx;
        X  = (X * beam) + offset;
        Y  = ((height - y) * beam) + offset;

        // Go to start of the line
        text.push('G0 X' + X.toFixed(2) + ' Y' + Y.toFixed(2));

        // For each pixel on the range
        if (reverse) {
            for (x = range.end; x >= range.start; x--) {
                // Set first pixel position
                X  = (x * beam) + offset;

                // Get pixel power
                S = getPixelPower(x, y);

                // Go to start of the line
                text.push('G1 X' + X.toFixed(2) + ' S' + S.toFixed(4));
            }
        }
        else {
            for (x = range.start; x <= range.end; x++) {
                // Set first pixel position
                X  = (x * beam) + offset;

                // Get pixel power
                S = getPixelPower(x, y);

                // Go to start of the line
                text.push('G1 X' + X.toFixed(2) + ' S' + S.toFixed(4));
            }
        }

        // Post the gcode pixel line
        postMessage({ type: 'gcode', data: { line: y, text: text.join('\n') } });
    }

    postMessage({ type: 'done' });
}

// -----------------------------------------------------------------------------

// On message received
self.onmessage = function(event) {
    var message = event.data;

    if (typeof message === 'string') {
        message = JSON.parse(event.data);
    }

    // On canvas data
    if (message.type === 'cell') {
        //console.log(message.data);

        if (! canvas[message.y]) {
            canvas[message.y] = [];
        }

        canvas[message.y][message.x] = message.data;
    }

    // On all canvas sent
    else if (message.type === 'done') {
        var width  = (settings.imageSize.width * settings.beamSize).toFixed(2);
        var height = (settings.imageSize.height * settings.beamSize).toFixed(2);
        var min    = (settings.beamPower.min * 100).toFixed(0);
        var max    = (settings.beamPower.max * 100).toFixed(0);
        var text   = [
            '; Generated by Rasterizer.js (alpha)',
            '; Size       : ' + width + ' x ' + height + ' mm',
            '; Resolution : ' + settings.ppm + ' PPM - ' + settings.ppi + ' PPI',
            '; Beam size  : ' + settings.beamSize + ' mm',
            '; Beam power : ' + min + '% to ' + max + '%',
            '; Feed rate  : ' + settings.feedRate + ' mm/min',
            '',
            'G0 F' + settings.feedRate,
            'G1 F' + settings.feedRate,
            ''
        ];
        postMessage({ type: 'gcode', data: { text: text.join('\n') } });
        rasterize();
    }

    // Init rasteriser
    else if (message.type === 'init') {
        settings = message.data;
        canvas   = [];
    }
};
