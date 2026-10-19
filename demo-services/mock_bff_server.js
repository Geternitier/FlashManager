import http from 'http';
const port = Number(process.argv[2] || 13000);

const server = http.createServer((req, res) => {
  console.log(`[NodeBFF] ${req.method} ${req.url} -> 200 OK`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, service: 'Node BFF Gateway', port }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`🚀 [NodeBFF] Server listening at http://127.0.0.1:${port}`);
});

setInterval(() => {
  const mem = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
  console.log(`[NodeBFF] Heartbeat OK | RSS=${mem}MB | Active connections=0`);
}, 8000);
