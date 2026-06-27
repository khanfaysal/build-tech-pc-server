require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = express();
const port = process.env.PORT || 5000;

const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

app.use(cors());
app.use(express.json());
// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

const getImageExtension = (url, contentType = '') => {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext;
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  return '.jpg';
};

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

const getIdQuery = (id) => ({
  $or: [
    { _id: ObjectId.isValid(id) ? new ObjectId(id) : null },
    { _id: id },
  ].filter((query) => query._id !== null),
});

const createSlug = (title = '') => {
  const base = title
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return base || `post-${Date.now()}`;
};

const run = async () => {
  try {
    console.log("Attempting to connect to MongoDB...");
    await client.connect();
    db = client.db('build-tech-pc');
    productCollection = db.collection('build-pc');
    const buildsCollection = db.collection('builds');
    const ordersCollection = db.collection('orders');
    const usersCollection = db.collection('users');
    const blogsCollection = db.collection('blogs');
    const salesCollection = db.collection('sales');
    app.locals.buildsCollection = buildsCollection;
    app.locals.ordersCollection = ordersCollection;
    app.locals.usersCollection = usersCollection;
    app.locals.blogsCollection = blogsCollection;
    app.locals.salesCollection = salesCollection;
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

// --- BLOG ROUTES ---

app.get('/blogs', async (req, res) => {
  const blogsCollection = app.locals.blogsCollection;
  if (!blogsCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }

  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const blogs = await blogsCollection
      .find({ status: { $ne: 'draft' } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    res.json({ status: true, data: blogs });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.get('/blogs/:slug', async (req, res) => {
  const blogsCollection = app.locals.blogsCollection;
  if (!blogsCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }

  try {
    const slug = req.params.slug;
    const blog = await blogsCollection.findOne({
      $or: [
        { slug },
        { _id: ObjectId.isValid(slug) ? new ObjectId(slug) : null },
      ].filter((query) => query.slug || query._id !== null),
    });

    if (!blog) {
      return res.status(404).json({ status: false, message: 'Blog not found' });
    }

    res.json({ status: true, data: blog });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.get('/admin/blogs', verifyToken, authorize(['masteradmin', 'admin']), async (req, res) => {
  const blogsCollection = app.locals.blogsCollection;
  if (!blogsCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }

  try {
    const blogs = await blogsCollection.find({}).sort({ updatedAt: -1 }).toArray();
    res.json({ status: true, data: blogs });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.post('/admin/blogs', verifyToken, authorize(['masteradmin', 'admin']), async (req, res) => {
  const blogsCollection = app.locals.blogsCollection;
  if (!blogsCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }

  try {
    const blog = req.body;
    const now = new Date();
    const slug = blog.slug || createSlug(blog.title);
    const existing = await blogsCollection.findOne({ slug });

    if (existing) {
      return res.status(409).json({ status: false, message: 'A blog with this slug already exists' });
    }

    const result = await blogsCollection.insertOne({
      title: blog.title,
      slug,
      excerpt: blog.excerpt || '',
      content: blog.content || '',
      coverImage: blog.coverImage || '',
      author: blog.author || req.user.email,
      category: blog.category || 'PC Guide',
      status: blog.status || 'published',
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.patch('/admin/blogs/:id', verifyToken, authorize(['masteradmin', 'admin']), async (req, res) => {
  const blogsCollection = app.locals.blogsCollection;
  if (!blogsCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }

  try {
    const update = { ...req.body, updatedAt: new Date() };
    if (update.title && !update.slug) {
      update.slug = createSlug(update.title);
    }

    const result = await blogsCollection.updateOne(getIdQuery(req.params.id), { $set: update });
    if (result.matchedCount === 0) {
      return res.status(404).json({ status: false, message: 'Blog not found' });
    }

    res.json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.delete('/admin/blogs/:id', verifyToken, authorize(['masteradmin', 'admin']), async (req, res) => {
  const blogsCollection = app.locals.blogsCollection;
  if (!blogsCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }

  try {
    const result = await blogsCollection.deleteOne(getIdQuery(req.params.id));
    if (result.deletedCount === 0) {
      return res.status(404).json({ status: false, message: 'Blog not found' });
    }

    res.json({ status: true, message: 'Blog deleted successfully' });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

// --- SALES / AFFILIATE ROUTES ---

app.get('/sales', async (req, res) => {
  const salesCollection = app.locals.salesCollection;
  if (!salesCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }

  try {
    const query = { active: { $ne: false } };
    if (req.query.category) query.category = req.query.category;

    const sales = await salesCollection.find(query).sort({ createdAt: -1 }).toArray();
    res.json({ status: true, data: sales });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.get('/admin/sales', verifyToken, authorize(['masteradmin', 'admin']), async (req, res) => {
  const salesCollection = app.locals.salesCollection;
  if (!salesCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }

  try {
    const sales = await salesCollection.find({}).sort({ updatedAt: -1 }).toArray();
    res.json({ status: true, data: sales });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.post('/admin/sales', verifyToken, authorize(['masteradmin', 'admin']), async (req, res) => {
  const salesCollection = app.locals.salesCollection;
  if (!salesCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }

  try {
    const sale = req.body;
    const now = new Date();
    const result = await salesCollection.insertOne({
      title: sale.title,
      marketplace: sale.marketplace || 'Amazon',
      category: sale.category || 'Component',
      price: Number(sale.price) || 0,
      originalPrice: Number(sale.originalPrice) || 0,
      couponCode: sale.couponCode || '',
      affiliateUrl: sale.affiliateUrl || '',
      image: sale.image || '',
      badge: sale.badge || '',
      active: sale.active !== false,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.patch('/admin/sales/:id', verifyToken, authorize(['masteradmin', 'admin']), async (req, res) => {
  const salesCollection = app.locals.salesCollection;
  if (!salesCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }

  try {
    const update = { ...req.body, updatedAt: new Date() };
    if (update.price !== undefined) update.price = Number(update.price) || 0;
    if (update.originalPrice !== undefined) update.originalPrice = Number(update.originalPrice) || 0;

    const result = await salesCollection.updateOne(getIdQuery(req.params.id), { $set: update });
    if (result.matchedCount === 0) {
      return res.status(404).json({ status: false, message: 'Sale item not found' });
    }

    res.json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.delete('/admin/sales/:id', verifyToken, authorize(['masteradmin', 'admin']), async (req, res) => {
  const salesCollection = app.locals.salesCollection;
  if (!salesCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }

  try {
    const result = await salesCollection.deleteOne(getIdQuery(req.params.id));
    if (result.deletedCount === 0) {
      return res.status(404).json({ status: false, message: 'Sale item not found' });
    }

    res.json({ status: true, message: 'Sale item deleted successfully' });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.get('/compare-products', async (req, res) => {
  if (!productCollection) {
    return res.status(503).json({ status: false, message: 'Database unavailable' });
  }

  try {
    const ids = (req.query.ids || '').split(',').filter(Boolean);
    if (!ids.length) {
      return res.json({ status: true, data: [] });
    }

    const products = await productCollection.find({
      $or: ids.flatMap((id) => getIdQuery(id).$or),
    }).toArray();

    res.json({ status: true, data: products });
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

// --- UPLOAD ROUTE ---
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: false, message: 'No file uploaded' });
  }
  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ status: true, imageUrl });
});

app.post('/upload-url', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
      return res.status(400).json({ status: false, message: 'Valid image URL is required' });
    }

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 BuildTechPC image importer',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return res.status(400).json({ status: false, message: `Image download failed: ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ status: false, message: 'URL did not return an image file' });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const extension = getImageExtension(imageUrl, contentType);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
    const filePath = path.join(uploadDir, filename);

    fs.writeFileSync(filePath, buffer);

    res.json({
      status: true,
      imageUrl: `${req.protocol}://${req.get('host')}/uploads/${filename}`,
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
