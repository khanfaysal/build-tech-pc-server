require('dotenv').config();
const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

const cors = require('cors');

app.use(cors());
app.use(express.json());

const uri = process.env.DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;
let productCollection;

const run = async () => {
  try {
    console.log("Attempting to connect to MongoDB...");
    await client.connect();
    db = client.db('build-tech-pc');
    productCollection = db.collection('build-pc');
    console.log('✅ Connected to MongoDB successfully');
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:');
    console.error('   Error Message:', err.message);
    if (err.message.includes('Authentication failed')) {
      console.error('   ADVICE: Your DB_USER or DB_PASS in .env does not match what is set in MongoDB Atlas (Database Access).');
    }
  }
};

run();

app.get('/products', async (req, res) => {
  if (!productCollection) {
    return res.status(503).json({ status: false, message: 'Database connecting or unavailable' });
  }
  try {
    const cursor = productCollection.find({});
    const products = await cursor.toArray();
    res.send({ status: true, data: products });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.post('/product', async (req, res) => {
  if (!productCollection) {
    return res.status(503).json({ status: false, message: 'Database connecting or unavailable' });
  }
  try {
    const product = req.body;
    const result = await productCollection.insertOne(product);
    res.send(result);
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.get('/product/:id', async (req, res) => {
  if (!productCollection) {
    return res.status(503).json({ status: false, message: 'Database connecting or unavailable' });
  }
  try {
    const id = req.params.id;
    const result = await productCollection.findOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.delete('/product/:id', async (req, res) => {
  if (!productCollection) {
    return res.status(503).json({ status: false, message: 'Database connecting or unavailable' });
  }
  try {
    const id = req.params.id;
    const result = await productCollection.deleteOne({
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        status: false,
        message: 'Product not found',
      });
    }
    
    res.json({
      status: true,
      message: 'Product deleted successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.patch('/product/:id', async (req, res) => {
  if (!productCollection) {
    return res.status(503).json({ status: false, message: 'Database connecting or unavailable' });
  }
  try {
    const id = req.params.id;
    const updatedData = req.body;
    const result = await productCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        status: false,
        message: 'Product not found',
      });
    }

    res.json({
      status: true,
      message: 'Product updated successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('Hello, World'); 
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
