// Tiny static server with SPA fallback for the web export (used by the Playwright smoke test).
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.argv[2] || 'dist-fake');
const port = Number(process.argv[3] || 8089);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.ttf': 'font/ttf', '.jpg': 'image/jpeg' };
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving ${root} on ${port}`));
