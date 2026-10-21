const fs = require('fs');
const path = require('path');

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.js') || entry.name.endsWith('.html') || entry.name.endsWith('.css'))
    ) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.match(/(gsk_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,})/);
      if (matches) {
        console.error(`[SECURITY ERROR] Secret pattern leaked in build artifact: ${fullPath}`);
        console.error(`Matched token: ${matches[0].slice(0, 8)}...`);
        process.exit(1);
      }
    }
  }
}

console.log('[Security Audit] Scanning dist/ and dist-electron/ for leaked API keys...');
scanDir('dist');
scanDir('dist-electron');
console.log('✅ Security Audit Passed: No API keys or credentials found in built artifacts.');
