const express = require('express');
const helmet = require('helmet');
const app = express();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "api.paddle.com"],
    },
  },
  frameguard: { action: 'deny' },
}));

app.get('/test', (req, res) => res.json({ ok: true }));
app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(3199, () => {
  const http = require('http');
  http.get('http://localhost:3199/test', (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('X-Powered-By:', res.headers['x-powered-by'] || 'ABSENT (good)');
      console.log('Content-Security-Policy:', res.headers['content-security-policy'] || 'ABSENT');
      console.log('X-Frame-Options:', res.headers['x-frame-options'] || 'ABSENT');
      console.log('X-Content-Type-Options:', res.headers['x-content-type-options'] || 'ABSENT');
      console.log('Body:', data);
      server.close();
      process.exit(0);
    });
  });
});
