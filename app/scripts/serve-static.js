// Strict static server that behaves like GitHub Pages (RR-5 / DEMO-5): no SPA fallback, a directory
// without a trailing slash redirects to one, a missing file is a 404. Serves ROOT under PREFIX.
//   node scripts/serve-static.js dist-demo-site 8091 /demo/hearth
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.argv[2]);
const port = Number(process.argv[3] || 8091);
const prefix = (process.argv[4] || '').replace(/\/$/, '');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.ttf': 'font/ttf', '.jpg': 'image/jpeg' };
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith(`${prefix}/`) && p !== prefix) { res.writeHead(404); return res.end('not found'); }
  let file = path.join(root, p.slice(prefix.length));
  if (!file.startsWith(root)) { res.writeHead(404); return res.end('not found'); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!p.endsWith('/')) { res.writeHead(301, { location: `${p}/` }); return res.end(); }
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>404 (static host)</h1>'); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving ${root} at ${prefix}/ on ${port}`));
