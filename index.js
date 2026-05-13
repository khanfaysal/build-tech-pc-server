require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = express();
const port = process.env.PORT || 5000;

const cors = require('cors');

app.use(cors());
app.use(express.json());
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
    const buildsCollection = db.collection('builds');
    const ordersCollection = db.collection('orders');
    const usersCollection = db.collection('users');
    app.locals.buildsCollection = buildsCollection;
    app.locals.ordersCollection = ordersCollection;
    app.locals.usersCollection = usersCollection;
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
    // Set default quantity if not provided
    if (product.quantity === undefined) {
      product.quantity = 0;
    }
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
    const targetId = req.params.id;
    const result = await productCollection.findOne({ 
      $or: [
        { _id: ObjectId.isValid(targetId) ? new ObjectId(targetId) : null },
        { _id: targetId },
        { _id: !isNaN(parseInt(targetId)) ? parseInt(targetId) : null }
      ].filter(q => q._id !== null)
    });
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
    const targetId = req.params.id;
    const query = {
      $or: [
        { _id: ObjectId.isValid(targetId) ? new ObjectId(targetId) : null },
        { _id: targetId },
        { _id: !isNaN(parseInt(targetId)) ? parseInt(targetId) : null }
      ].filter(q => q._id !== null)
    };
    const result = await productCollection.deleteOne(query);

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
    const targetId = req.params.id;
    const updatedData = req.body;
    
    // Support numeric IDs, ObjectIds, and String IDs
    const query = {
      $or: [
        { _id: ObjectId.isValid(targetId) ? new ObjectId(targetId) : null },
        { _id: targetId },
        { _id: !isNaN(parseInt(targetId)) ? parseInt(targetId) : null }
      ].filter(q => q._id !== null)
    };
    
    const result = await productCollection.updateOne(
      query,
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

// Stripe and Orders
app.post('/create-checkout-session', async (req, res) => {
  const ordersCollection = app.locals.ordersCollection;
  try {
    const { items, totalPrice } = req.body;

    // Build line items for Stripe — filter out invalid images
    const lineItems = items.map(item => {
      const productData = { name: item.productName || item.model || 'PC Component' };
      // Only include image if it's a valid http/https URL (Stripe rejects others)
      if (item.image && item.image.startsWith('http')) {
        productData.images = [item.image];
      }
      return {
        price_data: {
          currency: 'bdt',
          product_data: productData,
          unit_amount: Math.floor((item.price || 0) * 100),
        },
        quantity: item.quantity || 1,
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/cart`,
    });

    // ✅ Save a pending order to MongoDB BEFORE redirecting to Stripe
    // This ensures order data is never lost even if the user refreshes the success page
    if (ordersCollection) {
      await ordersCollection.insertOne({
        sessionId: session.id,
        items: items,
        totalPrice: totalPrice,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    res.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe checkout session error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Verify payment with Stripe and update order status in MongoDB
app.get('/verify-payment/:session_id', async (req, res) => {
  const ordersCollection = app.locals.ordersCollection;
  if (!ordersCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }
  try {
    const { session_id } = req.params;

    // Retrieve the session from Stripe to confirm payment status
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.json({ status: false, message: 'Payment not completed' });
    }

    // Find the pending order
    const existingOrder = await ordersCollection.findOne({ sessionId: session_id });

    if (!existingOrder) {
      return res.status(404).json({ status: false, message: 'Order not found for this session' });
    }

    // If already marked as paid, just return the order (handles page refresh)
    if (existingOrder.status === 'paid') {
      return res.json({ status: true, alreadyProcessed: true, order: existingOrder });
    }

    // Update order status to paid
    await ordersCollection.updateOne(
      { sessionId: session_id },
      {
        $set: {
          status: 'paid',
          paymentIntentId: session.payment_intent,
          customerEmail: session.customer_details?.email || null,
          updatedAt: new Date(),
        }
      }
    );

    // Decrement product stock for each item
    if (existingOrder.items && Array.isArray(existingOrder.items)) {
      for (const item of existingOrder.items) {
        const productId = item._id || item.id;
        if (productId) {
          try {
            await productCollection.updateOne(
              { _id: new ObjectId(productId) },
              { $inc: { quantity: -item.quantity } }
            );
          } catch (stockErr) {
            console.warn(`Stock update skipped for item ${productId}:`, stockErr.message);
          }
        }
      }
    }

    res.json({
      status: true,
      message: 'Payment verified and order saved successfully',
      order: { ...existingOrder, status: 'paid' },
    });
  } catch (error) {
    console.error('Payment verification error:', error.message);
    res.status(500).json({ status: false, message: error.message });
  }
});

app.post('/orders', async (req, res) => {
  const ordersCollection = app.locals.ordersCollection;
  if (!ordersCollection) {
    return res.status(503).json({ status: false, message: 'Database connecting or unavailable' });
  }
  try {
    const order = req.body;
    
    // 1. Store the order
    const result = await ordersCollection.insertOne({
      ...order,
      createdAt: new Date()
    });

    // 2. Decrement product stock
    if (order.items && Array.isArray(order.items)) {
      for (const item of order.items) {
        const productId = item._id || item.id;
        if (productId) {
          await productCollection.updateOne(
            { _id: new ObjectId(productId) },
            { $inc: { quantity: -item.quantity } }
          );
        }
      }
    }

    res.send({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

// --- AUTH & RBAC MIDDLEWARE ---

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: false, message: 'Unauthorized' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ status: false, message: 'Forbidden' });
    req.user = decoded;
    next();
  });
};

const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ status: false, message: 'Access denied' });
    }
    next();
  };
};

// --- AUTH ROUTES ---

app.post('/auth/signup', async (req, res) => {
  const usersCollection = app.locals.usersCollection;
  try {
    const { email, password, role } = req.body;
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) return res.status(400).json({ status: false, message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      email,
      password_hash: hashedPassword,
      role: role || 'user',
      createdAt: new Date()
    };
    const result = await usersCollection.insertOne(newUser);
    res.status(201).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.post('/auth/signin', async (req, res) => {
  const usersCollection = app.locals.usersCollection;
  try {
    const { email, password } = req.body;
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(404).json({ status: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ status: false, message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    res.json({ status: true, token, user: { id: user._id, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

// --- ADMIN ROUTES ---

app.get('/admin/users', verifyToken, authorize(['masteradmin']), async (req, res) => {
  const usersCollection = app.locals.usersCollection;
  try {
    const users = await usersCollection.find({}, { projection: { password_hash: 0 } }).toArray();
    res.json({ status: true, data: users });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.patch('/admin/user-role/:id', verifyToken, authorize(['masteradmin']), async (req, res) => {
  const usersCollection = app.locals.usersCollection;
  try {
    const { role } = req.body;
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role } }
    );
    res.json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.delete('/order/:id', verifyToken, authorize(['masteradmin', 'admin']), async (req, res) => {
  const ordersCollection = app.locals.ordersCollection;
  if (!ordersCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }
  try {
    const id = req.params.id;
    const result = await ordersCollection.deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ status: false, message: 'Order not found' });
    }
    
    res.json({ status: true, message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.get('/admin/stats', async (req, res) => {
  const productsCollection = productCollection;
  const usersCollection = app.locals.usersCollection;
  const ordersCollection = app.locals.ordersCollection;

  try {
    const totalProducts = await productsCollection.countDocuments();
    const totalUsers = await usersCollection.countDocuments();
    const totalOrders = await ordersCollection.countDocuments();
    
    // Calculate total revenue from paid orders
    const orders = await ordersCollection.find({ status: 'paid' }).toArray();
    const totalRevenue = orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);

    // Get recent activity (last 5 products)
    const recentProducts = await productsCollection.find({}).sort({ _id: -1 }).limit(5).toArray();

    res.json({
      status: true,
      data: {
        totalProducts,
        totalUsers,
        totalOrders,
        totalRevenue,
        recentActivity: recentProducts.map(p => ({
          type: 'product',
          name: p.productName || p.model,
          time: 'Recently'
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.get('/orders', async (req, res) => {
  const ordersCollection = app.locals.ordersCollection;
  try {
    const cursor = ordersCollection.find({});
    const orders = await cursor.toArray();
    res.send({ status: true, data: orders });
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
