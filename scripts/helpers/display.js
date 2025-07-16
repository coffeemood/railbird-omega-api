/**
 * Display Helper
 * 
 * Utilities for pretty console output and formatting
 */

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m'
};

class Display {
    constructor() {
        this.indentLevel = 0;
        this.maxWidth = process.stdout.columns || 80;
    }

    /**
     * Apply color to text
     * @param {string} text - Text to colorize
     * @param {string} color - Color name
     * @returns {string} Colorized text
     */
    colorize(text, color) {
        const colorCode = colors[color] || '';
        return `${colorCode}${text}${colors.reset}`;
    }

    /**
     * Display main header
     * @param {string} text - Header text
     */
    header(text) {
        const separator = '='.repeat(this.maxWidth - 4);
        console.log(this.colorize(`\n${separator}`, 'cyan'));
        console.log(this.colorize(`  ${text}`, 'cyan'));
        console.log(this.colorize(`${separator}\n`, 'cyan'));
    }

    /**
     * Display phase header
     * @param {string} text - Phase text
     */
    phase(text) {
        const separator = '-'.repeat(Math.min(text.length + 4, this.maxWidth - 4));
        console.log(this.colorize(`\n${separator}`, 'blue'));
        console.log(this.colorize(`  ${text}`, 'bright'));
        console.log(this.colorize(`${separator}`, 'blue'));
    }

    /**
     * Display section header
     * @param {string} text - Section text
     */
    section(text) {
        console.log(this.colorize(`\n📋 ${text}:`, 'yellow'));
    }

    /**
     * Display subsection header
     * @param {string} text - Subsection text
     */
    subsection(text) {
        console.log(this.colorize(`\n  ${text}`, 'magenta'));
    }

    /**
     * Display a bullet point
     * @param {string} text - Bullet text
     */
    bullet(text) {
        const indent = '  '.repeat(this.indentLevel);
        console.log(`${indent}• ${text}`);
    }

    /**
     * Display indented text
     * @param {string} text - Text to indent
     */
    indent(text) {
        const indent = '    '.repeat(this.indentLevel + 1);
        console.log(`${indent}${text}`);
    }

    /**
     * Display a metric with label and value
     * @param {string} label - Metric label
     * @param {string|number} value - Metric value
     * @param {string} [color='white'] - Value color
     */
    metric(label, value, color = 'white') {
        const indent = '  '.repeat(this.indentLevel);
        const paddedLabel = label.padEnd(20);
        console.log(`${indent}• ${paddedLabel}: ${this.colorize(value, color)}`);
    }

    /**
     * Display success message
     * @param {string} text - Success text
     */
    success(text) {
        console.log(this.colorize(text, 'green'));
    }

    /**
     * Display error message
     * @param {string} text - Error text
     */
    error(text) {
        console.log(this.colorize(text, 'red'));
    }

    /**
     * Display warning message
     * @param {string} text - Warning text
     */
    warning(text) {
        console.log(this.colorize(text, 'yellow'));
    }

    /**
     * Display info message
     * @param {string} text - Info text
     */
    info(text) {
        console.log(this.colorize(text, 'blue'));
    }

    /**
     * Display debug message (dimmed)
     * @param {string} text - Debug text
     */
    debug(text) {
        console.log(this.colorize(text, 'gray'));
    }

    /**
     * Display a table of data
     * @param {Array} data - Array of objects to display
     * @param {Array} [columns] - Column definitions
     */
    table(data, columns = null) {
        if (!data || data.length === 0) {
            this.info('No data to display');
            return;
        }

        // Auto-detect columns if not provided
        if (!columns) {
            columns = Object.keys(data[0]).map(key => ({
                key,
                label: key.charAt(0).toUpperCase() + key.slice(1),
                width: 15
            }));
        }

        // Calculate column widths
        columns.forEach(col => {
            col.width = Math.max(
                col.label.length,
                ...data.map(row => String(row[col.key] || '').length),
                col.width || 10
            );
        });

        // Display header
        const headerRow = columns.map(col => col.label.padEnd(col.width)).join(' | ');
        console.log(this.colorize(headerRow, 'bright'));
        console.log(this.colorize('-'.repeat(headerRow.length), 'gray'));

        // Display data rows
        data.forEach(row => {
            const dataRow = columns.map(col => {
                const value = String(row[col.key] || '');
                return value.padEnd(col.width);
            }).join(' | ');
            console.log(dataRow);
        });
    }

    /**
     * Display a progress bar
     * @param {number} current - Current progress
     * @param {number} total - Total items
     * @param {string} [label='Progress'] - Progress label
     */
    progressBar(current, total, label = 'Progress') {
        const percentage = Math.round((current / total) * 100);
        const barLength = 30;
        const filled = Math.round((percentage / 100) * barLength);
        const empty = barLength - filled;
        
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        const display = `${label}: [${this.colorize(bar, 'green')}] ${percentage}% (${current}/${total})`;
        
        // Use \r to overwrite the same line
        process.stdout.write(`\r${display}`);
        
        // Add newline when complete
        if (current === total) {
            console.log('');
        }
    }

    /**
     * Display JSON data with syntax highlighting
     * @param {Object} data - JSON data to display
     * @param {string} [title] - Optional title
     */
    json(data, title = null) {
        if (title) {
            this.section(title);
        }
        
        const jsonString = JSON.stringify(data, null, 2);
        const highlighted = this.highlightJson(jsonString);
        console.log(highlighted);
    }

    /**
     * Simple JSON syntax highlighting
     * @param {string} jsonString - JSON string to highlight
     * @returns {string} Highlighted JSON
     */
    highlightJson(jsonString) {
        return jsonString
            .replace(/"([^"]+)":/g, this.colorize('"$1":', 'blue'))  // Keys
            .replace(/: "([^"]+)"/g, `: ${this.colorize('"$1"', 'green')}`)  // String values
            .replace(/: (\d+\.?\d*)/g, `: ${this.colorize('$1', 'yellow')}`)  // Numbers
            .replace(/: (true|false)/g, `: ${this.colorize('$1', 'magenta')}`)  // Booleans
            .replace(/: null/g, `: ${this.colorize('null', 'gray')}`);  // Null
    }

    /**
     * Display a divider line
     * @param {string} [char='─'] - Character to use for divider
     * @param {string} [color='gray'] - Color of divider
     */
    divider(char = '─', color = 'gray') {
        const line = char.repeat(this.maxWidth - 4);
        console.log(this.colorize(line, color));
    }

    /**
     * Clear the console
     */
    clear() {
        console.clear();
    }

    /**
     * Add blank lines
     * @param {number} [count=1] - Number of blank lines
     */
    newline(count = 1) {
        for (let i = 0; i < count; i++) {
            console.log('');
        }
    }

    /**
     * Display a box around text
     * @param {string} text - Text to box
     * @param {string} [color='white'] - Box color
     */
    box(text, color = 'white') {
        const lines = text.split('\n');
        const maxLength = Math.max(...lines.map(line => line.length));
        const boxWidth = Math.min(maxLength + 4, this.maxWidth - 4);
        
        const topLine = '┌' + '─'.repeat(boxWidth - 2) + '┐';
        const bottomLine = '└' + '─'.repeat(boxWidth - 2) + '┘';
        
        console.log(this.colorize(topLine, color));
        
        lines.forEach(line => {
            const paddedLine = `│ ${line.padEnd(boxWidth - 4)} │`;
            console.log(this.colorize(paddedLine, color));
        });
        
        console.log(this.colorize(bottomLine, color));
    }

    /**
     * Increase indent level
     */
    pushIndent() {
        this.indentLevel++;
    }

    /**
     * Decrease indent level
     */
    popIndent() {
        this.indentLevel = Math.max(0, this.indentLevel - 1);
    }

    /**
     * Execute function with increased indent
     * @param {Function} fn - Function to execute
     */
    withIndent(fn) {
        this.pushIndent();
        try {
            fn();
        } finally {
            this.popIndent();
        }
    }
}

module.exports = {
    Display,
    colors
};