require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.DB_URI;
const client = new MongoClient(uri);

async function checkDB() {
  try {
    await client.connect();
    const db = client.db('build-tech-pc');
    const productCollection = db.collection('build-pc');
    const products = await productCollection.find({}).toArray();
    console.log('Current Products in DB:');
    console.log(JSON.stringify(products, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

checkDB();
