// EIDON Analytics Dashboard — Standalone server
// Run: node admin/server.js
// Opens on http://localhost:4000
// Pulls data from the main EIDON server (localhost:3000 or live site)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4000;

const server = http.createServer((req, res) => {
  // Serve index.html for all routes
  const filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading dashboard');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  EIDON Analytics Dashboard`);
  console.log(`  ========================`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  Pulling data from the EIDON server\n`);
});
