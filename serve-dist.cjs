const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'E:\\成绩管家\\成绩管家_web\\dist';
const PORT = 8899;

const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(ROOT, filePath);
    
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
        '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
    };
    
    res.setHeader('Content-Type', mimeTypes[ext] || 'text/plain');
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('404: ' + filePath);
        } else {
            res.writeHead(200);
            res.end(data);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
