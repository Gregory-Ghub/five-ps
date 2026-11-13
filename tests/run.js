// Starts a static server for the repo root, then runs every *.test.js in this folder.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8765);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const runFile = f => new Promise(resolve => {
  const child = spawn(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', env: { ...process.env, BASE_URL: `http://localhost:${PORT}` } });
  child.on('exit', code => resolve(code));
});

server.listen(PORT, async () => {
  const only = process.argv[2];
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && (!only || f.includes(only)));
  let failed = 0;
  for (const f of files) {
    console.log(`\n=== ${f} ===`);
    if (await runFile(f) !== 0) failed++;
  }
  server.close();
  console.log(failed ? `\n${failed} test file(s) FAILED` : '\nAll test files passed');
  process.exit(failed ? 1 : 0);
});
