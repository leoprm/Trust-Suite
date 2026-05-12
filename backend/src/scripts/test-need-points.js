const http = require('http');

function api(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const opts = { hostname: 'localhost', port: 3100, path, method, headers };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  // Try flowtest user
  const login = await api('POST', '/api/auth/login', { email: 'flowtest@test.com', password: 'demo123' });
  console.log('Login:', login.error ? 'Failed: ' + login.error : 'OK, token len=' + login.token?.length);

  if (login.error) {
    // Try another
    const login2 = await api('POST', '/api/auth/login', { email: 'diego@demo.com', password: 'demo123' });
    console.log('Login2:', login2.error ? 'Failed: ' + login2.error : 'OK');
    if (!login2.error) {
      const trees = await api('GET', '/api/trees', null, login2.token);
      console.log('Trees count:', trees?.length);
      if (trees?.length > 0) {
        const members = await api('GET', '/api/trees/' + trees[0].id + '/members', null, login2.token);
        console.log('Member availableNeedPoints:', members[0]?.availableNeedPoints);
        const needs = await api('GET', '/api/needs?treeId=' + trees[0].id, null, login2.token);
        if (needs?.length > 0) {
          console.log('Need pointsAllocated:', needs[0]?.pointsAllocated, 'status:', needs[0]?.status);
        }
      }
    }
  }
  console.log('\n✅ Query test complete');
})().catch(e => console.error('FAIL:', e.message));
