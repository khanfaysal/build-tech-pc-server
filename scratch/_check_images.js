require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const client = new MongoClient(process.env.DB_URI, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});
(async () => {
  try {
    await client.connect();
    const col = client.db('build-tech-pc').collection('build-pc');
    const all = await col.find({}, { projection: { image: 1, productName: 1, model: 1 } }).toArray();
    const buckets = { localhost: [], vercelUploads: [], external: [], none: [], other: [] };
    for (const p of all) {
      const img = p.image || '';
      if (!img) buckets.none.push(p._id);
      else if (/localhost|127\.0\.0\.1/.test(img)) buckets.localhost.push(img);
      else if (/\/uploads\//.test(img)) buckets.vercelUploads.push(img);
      else if (/^https?:\/\//.test(img)) buckets.external.push(img);
      else buckets.other.push(img);
    }
    console.log('TOTAL products:', all.length);
    console.log('localhost URLs:', buckets.localhost.length, buckets.localhost.slice(0,3));
    console.log('uploads (non-localhost):', buckets.vercelUploads.length, buckets.vercelUploads.slice(0,3));
    console.log('external https:', buckets.external.length, buckets.external.slice(0,3));
    console.log('no image:', buckets.none.length);
    console.log('other:', buckets.other.length, buckets.other.slice(0,3));
  } catch (e) { console.error('ERR', e.message); }
  finally { await client.close(); }
})();
