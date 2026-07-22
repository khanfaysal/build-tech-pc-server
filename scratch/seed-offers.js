require('dotenv').config();
const { MongoClient } = require('mongodb');

// Demo seed: flag a few in-stock products with Offer / Power Hour prices so the
// storefront Deals features are visible. Re-run with CLEAR=1 to remove them.
const CLEAR = process.env.CLEAR === '1';

(async () => {
  const client = new MongoClient(process.env.DB_URI);
  try {
    await client.connect();
    const col = client.db('build-tech-pc').collection('build-pc');

    if (CLEAR) {
      const r = await col.updateMany({}, { $unset: { offerPrice: '', powerHourPrice: '' } });
      console.log('Cleared offer fields on', r.modifiedCount, 'products');
      return;
    }

    const inStock = await col
      .find({ status: { $ne: 'Out of Stock' }, price: { $gt: 0 } })
      .sort({ price: -1 })
      .limit(6)
      .toArray();

    if (inStock.length === 0) {
      console.log('No in-stock products to seed.');
      return;
    }

    let hot = 0;
    let power = 0;
    for (let i = 0; i < inStock.length; i++) {
      const p = inStock[i];
      const update = {};
      if (i % 2 === 0) {
        update.offerPrice = Math.round(p.price * 0.88); // 12% off (Hot Deal)
        hot++;
      } else {
        update.powerHourPrice = Math.round(p.price * 0.75); // 25% off (Power Hour)
        power++;
      }
      await col.updateOne({ _id: p._id }, { $set: update });
      console.log(`  ${p.productName || p.model}: ${JSON.stringify(update)}`);
    }
    console.log(`Seeded ${hot} Hot Deals and ${power} Power Hour products.`);
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await client.close();
  }
})();
