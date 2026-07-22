require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const EMAIL = 'mdfaysalkhancse@gmail.com';
const TRY_PASSWORD = 'faysal123';

(async () => {
  const client = new MongoClient(process.env.DB_URI);
  try {
    await client.connect();
    const users = client.db('build-tech-pc').collection('users');
    const user = await users.findOne({ email: EMAIL });
    if (!user) {
      console.log('RESULT: no user with that email exists.');
      const all = await users.find({}, { projection: { email: 1, role: 1 } }).toArray();
      console.log('Existing users:', all);
      return;
    }
    const match = await bcrypt.compare(TRY_PASSWORD, user.password_hash || '');
    console.log('RESULT: user found');
    console.log('  email:', user.email);
    console.log('  role :', user.role);
    console.log('  password "' + TRY_PASSWORD + '" matches hash:', match);
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await client.close();
  }
})();
