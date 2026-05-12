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
    console.log(products, "products");

    let updatedCount = 0;

    for (const product of products) {
      // Create some dummy data based on the category
      const keyFeatures = {
        Brand: "Generic Brand",
        Model: "Pro " + product.category,
        Warranty: "1 Year",
      };

      if (product.category === 'RAM') {
        keyFeatures.Capacity = "16GB";
        keyFeatures.Speed = "3200MHz";
      } else if (product.category === 'Processor') {
        keyFeatures.Cores = "8 Cores";
        keyFeatures.Threads = "16 Threads";
      } else if (product.category === 'Casing') {
        keyFeatures.Type = "Mid Tower";
        keyFeatures.Color = "Black";
      }

      const reviews = [
        {
          username: "PCBuilder99",
          rating: 5,
          comment: "Excellent value for the price. Highly recommended!",
        },
        {
          username: "TechEnthusiast",
          rating: 4,
          comment: "Works perfectly, but the packaging was slightly damaged.",
        }
      ];

      const averageRating = 4.5;

      await productCollection.updateOne(
        { _id: product._id },
        { 
          $set: { 
            keyFeatures, 
            reviews, 
            averageRating 
          } 
        }
      );
      updatedCount++;
    }

    console.log(`Successfully updated ${updatedCount} products with keyFeatures, reviews, and averageRating.`);
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
