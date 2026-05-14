const jwt = require('jsonwebtoken');
const secret = '64e6bade7bc19d9f1ef9c797baf46e6ff511377db5a4ea310015797a44699570981e7026b1c64468da2bf675da59c280b1399bd01c18691de95b891aff3ccee2';
console.log(jwt.sign({ id: 'db98f726-8ac4-4fd5-b560-1c6b92e1ab26' }, secret, { expiresIn: '1h' }));
