const path = require('path');
try {
  const routes = require('./src/routes/billingRoutes');
  console.log('OK - routes loaded, type:', typeof routes);
} catch(e) {
  console.log('ERROR:', e.message);
  console.log(e.stack.split('\n').slice(0,5).join('\n'));
}
