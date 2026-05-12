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

    const products = await productCollection.find({}).toArray();
    console.log(`Found ${products.length} products to update.`);

    let updatedCount = 0;

    for (const product of products) {
      // Generate a random stock count between 1 and 10
      const randomStock = Math.floor(Math.random() * 10) + 1;

      await productCollection.updateOne(
        { _id: product._id },
        { 
          $set: { 
            stock: randomStock
          } 
        }
      );
      updatedCount++;
    }

    console.log(`Successfully updated ${updatedCount} products with a random stock count.`);
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
