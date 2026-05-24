/**
 * Build script for OS Odyssey
 * 
 * Copies the entire os-odyssey directory to dist/,
 * then obfuscates all JS files in-place within dist/.
 * 
 * Source files remain untouched — only dist/ is modified.
 */

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const SRC_DIR = path.join(__dirname, 'os-odyssey');
const DIST_DIR = path.join(__dirname, 'dist', 'os-odyssey');

// Obfuscation settings — strong protection while keeping code functional
const OBFUSCATOR_OPTIONS = {
  // Compacts the output into a single line
  compact: true,
  // Control flow flattening makes logic very hard to follow
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  // Dead code injection adds fake code blocks
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  // Prevents debugging via DevTools
  debugProtection: false,
  // Disables console output (set to false to keep console.log working)
  disableConsoleOutput: false,
  // Mangles variable/function names
  identifierNamesGenerator: 'hexadecimal',
  // Logs obfuscation (false = silent)
  log: false,
  // Moves number literals into an array
  numbersToExpressions: true,
  // Renames global variables
  renameGlobals: false,
  // Self-defending makes the code break if reformatted
  selfDefending: true,
  // Simplify expressions
  simplify: true,
  // Splits strings into chunks
  splitStrings: true,
  splitStringsChunkLength: 10,
  // Encodes all string literals
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.75,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  // Transform object keys
  transformObjectKeys: true,
  // Unicode escape sequences
  unicodeEscapeSequence: false
};

/**
 * Recursively copies a directory
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively finds all .js files in a directory
 */
function findJsFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsFiles(fullPath));
    } else if (entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Main Build ──────────────────────────────────────────────

console.log('🔨 OS Odyssey Build - JavaScript Obfuscation');
console.log('============================================\n');

// Step 1: Clean dist
if (fs.existsSync(path.join(__dirname, 'dist'))) {
  console.log('🗑️  Cleaning previous dist/...');
  fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });
}

// Step 2: Copy everything to dist
console.log('📋 Copying source files to dist/...');
copyDirSync(SRC_DIR, DIST_DIR);

// Step 3: Find and obfuscate all JS files in dist
const jsFiles = findJsFiles(path.join(DIST_DIR, 'frontend', 'js'));
console.log(`\n🔒 Obfuscating ${jsFiles.length} JavaScript files...\n`);

let successCount = 0;
let errorCount = 0;

for (const filePath of jsFiles) {
  const relativePath = path.relative(DIST_DIR, filePath);
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const obfuscated = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS);
    fs.writeFileSync(filePath, obfuscated.getObfuscatedCode());
    console.log(`  ✅ ${relativePath}`);
    successCount++;
  } catch (err) {
    console.error(`  ❌ ${relativePath}: ${err.message}`);
    errorCount++;
  }
}

console.log(`\n============================================`);
console.log(`✅ Obfuscated: ${successCount} files`);
if (errorCount > 0) {
  console.log(`❌ Errors: ${errorCount} files`);
}
console.log(`📁 Output: dist/os-odyssey/`);
console.log('🚀 Ready for deployment!\n');
