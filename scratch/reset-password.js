require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const EMAIL = 'mdfaysalkhancse@gmail.com';
const NEW_PASSWORD = 'faysal123';

(async () => {
  const client = new MongoClient(process.env.DB_URI);
  try {
    await client.connect();
    const users = client.db('build-tech-pc').collection('users');
    const hash = await bcrypt.hash(NEW_PASSWORD, 10);
    const r = await users.updateOne({ email: EMAIL }, { $set: { password_hash: hash } });
    console.log('matched:', r.matchedCount, 'modified:', r.modifiedCount);
    const check = await bcrypt.compare(NEW_PASSWORD, (await users.findOne({ email: EMAIL })).password_hash);
    console.log('verify new password matches:', check);
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await client.close();
  }
})();
