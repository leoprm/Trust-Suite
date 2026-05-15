const jwt = require('jsonwebtoken');
const secret = '4291a2d95d7b53e47d67c0a2c1c2c2321da1def8720728f8097d84ed843a8b8f8906b0c83d18960e269e7c9560cc1860cf16506e00b89cc7333cc96e752f4873';
console.log(jwt.sign({ id: 'db98f726-8ac4-4fd5-b560-1c6b92e1ab26' }, secret, { expiresIn: '1h' }));
