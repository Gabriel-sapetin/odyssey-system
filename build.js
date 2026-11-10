/**
 * Build script for OS Odyssey
 * 
 * 1. Copies the entire os-odyssey directory to dist/os-odyssey/
 * 2. Restructures dist/ for clean URLs:
 *    - HTML files move to dist/ root
 *    - css/, js/, assets/ move to dist/ root
 *    - sw.js, manifest.json move to dist/ root
 * 3. Rewrites all relative paths & internal links in HTML files to clean URLs
 * 4. Rewrites absolute paths & navigations in JS files to clean URLs
 * 5. Obfuscates all JS files in-place within dist/
 * 
 * Source files remain untouched — only dist/ is modified.
 */

const fs = require('fs');
const path = require('path');
let JavaScriptObfuscator;
try {
  JavaScriptObfuscator = require('javascript-obfuscator');
} catch (e) {
  JavaScriptObfuscator = null;
}

const SRC_DIR = path.join(__dirname, 'os-odyssey');
const DIST_DIR = path.join(__dirname, 'dist');
const TEMP_DIR = path.join(DIST_DIR, 'os-odyssey');

// Obfuscation settings — strong protection while keeping code functional
const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
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
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

/**
 * Recursively copies a directory, optionally skipping certain subdirectory names
 */
function copyDirSync(src, dest, skipDirs = []) {
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (skipDirs.includes(entry.name)) continue;
      copyDirSync(srcPath, destPath, skipDirs);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively moves all files from src into dest (merging directories)
 */
function moveDirContents(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      moveDirContents(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively finds all files with a given extension in a directory
 */
function findFiles(dir, ext) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Recursively finds all .js files in a directory
 */
function findJsFiles(dir) {
  return findFiles(dir, '.js');
}

// ── Main Build ──────────────────────────────────────────────

console.log('🔨 OS Odyssey Build - Clean URLs + JavaScript Obfuscation');
console.log('==========================================================\n');

// Step 1: Clean dist
if (fs.existsSync(DIST_DIR)) {
  console.log('🗑️  Cleaning previous dist/...');
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}

// Step 2: Copy everything to dist/os-odyssey/ (temporary), skip backend/database dirs
console.log('📋 Copying source files to dist/os-odyssey/...');
copyDirSync(SRC_DIR, TEMP_DIR, ['backend', 'database', '.venv', 'node_modules', '__pycache__']);

// Step 3: Restructure dist/ for clean URLs
console.log('📂 Restructuring dist/ for clean URLs...\n');

// 3a: Move HTML files from dist/os-odyssey/frontend/html/ → dist/
const htmlSrcDir = path.join(TEMP_DIR, 'frontend', 'html');
const htmlFiles = fs.readdirSync(htmlSrcDir).filter(f => f.endsWith('.html'));
for (const file of htmlFiles) {
  fs.copyFileSync(path.join(htmlSrcDir, file), path.join(DIST_DIR, file));
  console.log(`  📄 ${file} → dist/${file}`);
}

// 3b: Move css/ from dist/os-odyssey/frontend/css/ → dist/css/
moveDirContents(path.join(TEMP_DIR, 'frontend', 'css'), path.join(DIST_DIR, 'css'));
console.log('  📁 frontend/css/ → dist/css/');

// 3c: Move js/ from dist/os-odyssey/frontend/js/ → dist/js/
moveDirContents(path.join(TEMP_DIR, 'frontend', 'js'), path.join(DIST_DIR, 'js'));
console.log('  📁 frontend/js/ → dist/js/');

// 3d: Move assets/ from dist/os-odyssey/assets/ → dist/assets/
moveDirContents(path.join(TEMP_DIR, 'assets'), path.join(DIST_DIR, 'assets'));
console.log('  📁 assets/ → dist/assets/');

// 3e: Move sw.js and manifest.json to dist/ root
fs.copyFileSync(path.join(TEMP_DIR, 'sw.js'), path.join(DIST_DIR, 'sw.js'));
console.log('  📄 sw.js → dist/sw.js');
fs.copyFileSync(path.join(TEMP_DIR, 'manifest.json'), path.join(DIST_DIR, 'manifest.json'));
console.log('  📄 manifest.json → dist/manifest.json');

// 3f: Remove the temporary dist/os-odyssey/ directory
fs.rmSync(TEMP_DIR, { recursive: true, force: true });
console.log('\n  🗑️  Removed temporary dist/os-odyssey/');

// Step 4: Fix relative paths and internal links in HTML files
console.log('\n🔗 Fixing paths and links in HTML files...\n');

for (const file of htmlFiles) {
  const filePath = path.join(DIST_DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Relative asset/style/script paths
  // ../../assets/ → /assets/  (was 2 levels up from html/)
  content = content.replace(/\.\.\/\.\.\/assets\//g, '/assets/');
  // ../css/ → /css/  (was 1 level up from html/)
  content = content.replace(/\.\.\/css\//g, '/css/');
  // ../js/ → /js/  (was 1 level up from html/)
  content = content.replace(/\.\.\/js\//g, '/js/');
  // ../../manifest.json → /manifest.json
  content = content.replace(/\.\.\/\.\.\/manifest\.json/g, '/manifest.json');
  // ../../sw.js → /sw.js (if referenced)
  content = content.replace(/\.\.\/\.\.\/sw\.js/g, '/sw.js');

  // Convert internal .html links to clean URLs
  // href="index.html" -> href="/"
  content = content.replace(/href="index\.html"/g, 'href="/"');
  content = content.replace(/href="index\.html#/g, 'href="/#');
  // href="page.html" -> href="/page"
  // href="page.html#section" -> href="/page#section"
  content = content.replace(/href="([a-zA-Z0-9_-]+)\.html(#?)/g, 'href="/$1$2');
  content = content.replace(/href="([a-zA-Z0-9_-]+)\.html"/g, 'href="/$1"');

  // Convert data-redirect="xxx.html" -> data-redirect="/xxx"
  content = content.replace(/data-redirect="index\.html"/g, 'data-redirect="/"');
  content = content.replace(/data-redirect="([a-zA-Z0-9_-]+)\.html"/g, 'data-redirect="/$1"');

  // Convert action="xxx.html" -> action="/xxx"
  content = content.replace(/action="index\.html"/g, 'action="/"');
  content = content.replace(/action="([a-zA-Z0-9_-]+)\.html"/g, 'action="/$1"');

  fs.writeFileSync(filePath, content);
  console.log(`  ✅ ${file}`);
}

// Step 4b: Fix relative paths in CSS files
// CSS url() paths are resolved relative to the CSS file location.
// CSS files moved from frontend/css/ to css/, so ../../assets/ needs to become ../assets/
console.log('\n🔗 Fixing paths in CSS files...\n');

const cssFiles = findFiles(path.join(DIST_DIR, 'css'), '.css');
for (const cssFile of cssFiles) {
  const relPath = path.relative(DIST_DIR, cssFile);
  let content = fs.readFileSync(cssFile, 'utf8');
  const original = content;
  
  // ../../assets/ → ../assets/ (from css/ folder, go up one level to reach assets/)
  content = content.replace(/\.\.\/\.\.\/assets\//g, '../assets/');
  
  if (content !== original) {
    fs.writeFileSync(cssFile, content);
    console.log(`  ✅ ${relPath} — paths updated`);
  }
}

// Step 5: Fix absolute paths and clean URL navigations in JS files (before obfuscation)
console.log('\n🔗 Fixing paths in JS files...\n');

// 5a: Fix sw.js — update APP_SHELL paths
const swPath = path.join(DIST_DIR, 'sw.js');
let swContent = fs.readFileSync(swPath, 'utf8');
swContent = swContent.replace(/\/os-odyssey\/frontend\/html\//g, '/');
swContent = swContent.replace(/\/os-odyssey\/frontend\/css\//g, '/css/');
swContent = swContent.replace(/\/os-odyssey\/frontend\/js\//g, '/js/');
swContent = swContent.replace(/\/os-odyssey\/assets\//g, '/assets/');
swContent = swContent.replace(/\/os-odyssey\/manifest\.json/g, '/manifest.json');
swContent = swContent.replace(/\/os-odyssey\/sw\.js/g, '/sw.js');
swContent = swContent.replace(/\/os-odyssey\//g, '/');
fs.writeFileSync(swPath, swContent);
console.log('  ✅ sw.js — APP_SHELL paths updated');

// 5b: Fix manifest.json — update all absolute paths
const manifestPath = path.join(DIST_DIR, 'manifest.json');
let manifestContent = fs.readFileSync(manifestPath, 'utf8');
manifestContent = manifestContent.replace(/\/os-odyssey\/frontend\/html\/index\.html/g, '/');
manifestContent = manifestContent.replace(/\/os-odyssey\/frontend\/html\/([a-zA-Z0-9_-]+)\.html/g, '/$1');
manifestContent = manifestContent.replace(/\/os-odyssey\/frontend\/html\//g, '/');
manifestContent = manifestContent.replace(/\/os-odyssey\/assets\//g, '/assets/');
manifestContent = manifestContent.replace(/"scope":\s*"\/os-odyssey\/"/g, '"scope": "/"');
manifestContent = manifestContent.replace(/"start_url":\s*"\/index\.html"/g, '"start_url": "/"');
manifestContent = manifestContent.replace(/"url":\s*"\/([a-zA-Z0-9_-]+)\.html"/g, '"url": "/$1"');
fs.writeFileSync(manifestPath, manifestContent);
console.log('  ✅ manifest.json — paths updated');

// 5c: Fix pwa-register.js — SW registration path and scope
const pwaPath = path.join(DIST_DIR, 'js', 'pwa-register.js');
let pwaContent = fs.readFileSync(pwaPath, 'utf8');
pwaContent = pwaContent.replace(/\/os-odyssey\/sw\.js/g, '/sw.js');
pwaContent = pwaContent.replace(/scope:\s*'\/os-odyssey\/'/g, "scope: '/'");
pwaContent = pwaContent.replace(/\/os-odyssey\/assets\//g, '/assets/');
fs.writeFileSync(pwaPath, pwaContent);
console.log('  ✅ pwa-register.js — SW scope & paths updated');

// 5d: Fix main.js — OAuth redirectTo path
const mainJsPath = path.join(DIST_DIR, 'js', 'main.js');
let mainJsContent = fs.readFileSync(mainJsPath, 'utf8');
mainJsContent = mainJsContent.replace(
  /\/os-odyssey\/frontend\/html\/character-select\.html/g,
  '/character-select'
);
mainJsContent = mainJsContent.replace(/\/os-odyssey\/frontend\/html\//g, '/');
mainJsContent = mainJsContent.replace(/\/os-odyssey\/assets\//g, '/assets/');
fs.writeFileSync(mainJsPath, mainJsContent);
console.log('  ✅ main.js — OAuth redirect & paths updated');

// 5e: Fix ALL JS files — paths and page navigations
const allJsFiles = findJsFiles(path.join(DIST_DIR, 'js'));
for (const jsFile of allJsFiles) {
  const relPath = path.relative(DIST_DIR, jsFile);
  
  let content = fs.readFileSync(jsFile, 'utf8');
  const original = content;
  
  // Fix absolute /os-odyssey/ paths
  content = content.replace(/\/os-odyssey\/frontend\/html\//g, '/');
  content = content.replace(/\/os-odyssey\/frontend\/css\//g, '/css/');
  content = content.replace(/\/os-odyssey\/frontend\/js\//g, '/js/');
  content = content.replace(/\/os-odyssey\/assets\//g, '/assets/');
  content = content.replace(/\/os-odyssey\//g, '/');
  
  // Fix relative paths used in JS
  content = content.replace(/\.\.\/\.\.\/assets\//g, '/assets/');
  content = content.replace(/\.\.\/css\//g, '/css/');
  content = content.replace(/\.\.\/js\//g, '/js/');
  content = content.replace(/\.\.\/\.\.\/manifest\.json/g, '/manifest.json');
  
  // Clean URL page navigations in JS:
  // window.location.href = 'index.html' -> window.location.href = '/'
  content = content.replace(/window\.location\.href\s*=\s*['"]index\.html['"]/g, "window.location.href = '/'");
  // window.location.href = 'xxx.html' -> window.location.href = '/xxx'
  content = content.replace(/window\.location\.href\s*=\s*['"]([a-zA-Z0-9_-]+)\.html['"]/g, "window.location.href = '/$1'");
  // window.location.replace('index.html') -> window.location.replace('/')
  content = content.replace(/window\.location\.replace\(['"]index\.html['"]\)/g, "window.location.replace('/')");
  // window.location.replace('xxx.html') -> window.location.replace('/xxx')
  content = content.replace(/window\.location\.replace\(['"]([a-zA-Z0-9_-]+)\.html['"]\)/g, "window.location.replace('/$1')");
  // link.href = 'index.html' -> link.href = '/'
  content = content.replace(/(\w+Link|\w+Button)\.href\s*=\s*['"]index\.html['"]/g, "$1.href = '/'");
  // link.href = 'xxx.html' -> link.href = '/xxx'
  content = content.replace(/(\w+Link|\w+Button)\.href\s*=\s*['"]([a-zA-Z0-9_-]+)\.html['"]/g, "$1.href = '/$2'");
  
  if (content !== original) {
    fs.writeFileSync(jsFile, content);
    console.log(`  ✅ ${relPath} — paths & navigations updated`);
  }
}

// Step 6: Find and obfuscate all JS files in dist/js/
const jsFiles = findJsFiles(path.join(DIST_DIR, 'js'));

if (JavaScriptObfuscator) {
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

  console.log(`\n==========================================================`);
  console.log(`✅ Obfuscated: ${successCount} files`);
  if (errorCount > 0) {
    console.log(`❌ Errors: ${errorCount} files`);
  }
} else {
  console.log(`\n⚠️  javascript-obfuscator not found, skipping obfuscation for local build.`);
}

// Final verification: list dist/ root
const distContents = fs.readdirSync(DIST_DIR);
console.log(`\n📁 dist/ contents: ${distContents.join(', ')}`);
console.log('🚀 Ready for deployment with clean URLs!\n');
