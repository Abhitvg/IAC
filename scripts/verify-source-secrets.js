const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const textExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.sql',
  '.yml',
  '.yaml',
  '.sh',
  '.env',
  '.toml',
  '.xml',
  '.html',
  '.css',
  '.txt',
]);

// Provider key fixtures in tests are deliberately short; production token lengths are enforced here.
const secretPatterns = [
  /gsk_[A-Za-z0-9_-]{48,}/,
  /sk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{48,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{22,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /AIza[0-9A-Za-z_-]{35}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

const findings = [];
for (const file of tracked) {
  const extension = file.slice(file.lastIndexOf('.'));
  if (!textExtensions.has(extension) || !fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      findings.push(file);
      break;
    }
  }
}

if (findings.length) {
  console.error('[SECURITY] Potential committed secret detected in:');
  for (const file of findings) console.error(` - ${file}`);
  process.exit(1);
}
console.log(`[SECURITY] Source scan passed (${tracked.length} tracked files inspected).`);
