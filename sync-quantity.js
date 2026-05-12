require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db('build-tech-pc');
    const productCollection = db.collection('build-pc');

    // Rename 'stock' back to 'quantity' as requested
    const result = await productCollection.updateMany({}, { 
      $rename: { "stock": "quantity" } 
    });
    
    console.log(`Successfully renamed stock to quantity in ${result.modifiedCount} products.`);
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
