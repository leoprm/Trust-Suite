const jwt = require('jsonwebtoken');
require('dotenv').config();
const token = jwt.sign({ id: 'ari', role: 'SYSTEM' }, process.env.JWT_SECRET);
console.log(token);
