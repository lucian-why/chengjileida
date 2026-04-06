const http = require('http');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'dist', 'index.html');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(filePath));
});

server.listen(8899, () => console.log('HTTP server running on http://localhost:8899'));
