require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cloudinary = require('cloudinary').v2;

cloudinary.config({ cloud_name: 'dsbhzvire', api_key: '847543134411382', api_secret: 'mUG9jI3f2yLojQz5X1skxh2IGHo' });

const client = new MongoClient(process.env.DB_URI, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

(async () => {
  try {
    await client.connect();
    const col = client.db('build-tech-pc').collection('build-pc');
    const broken = await col.find({ image: /localhost|127\.0\.0\.1/ }).toArray();
    console.log(`Found ${broken.length} products with localhost images\n`);

    let ok = 0, missing = 0, fail = 0;
    for (const p of broken) {
      const filename = decodeURIComponent(p.image.split('/uploads/')[1] || '').split('?')[0];
      const localPath = path.join(__dirname, '..', 'uploads', filename);
      const label = p.productName || p.model || p._id;
      if (!filename || !fs.existsSync(localPath)) {
        console.log(`MISSING FILE  [${label}] -> ${filename}`);
        missing++;
        continue;
      }
      try {
        const up = await cloudinary.uploader.upload(localPath, { folder: 'build-tech-pc/products' });
        await col.updateOne({ _id: p._id }, { $set: { image: up.secure_url } });
        console.log(`OK            [${label}]`);
        console.log(`              ${up.secure_url}`);
        ok++;
      } catch (e) {
        console.log(`UPLOAD FAIL   [${label}] -> ${(e && e.message) || e}`);
        fail++;
      }
    }
    console.log(`\nDONE. uploaded+updated: ${ok}, missing files: ${missing}, failed: ${fail}`);
  } catch (e) { console.error('ERR', e.message); }
  finally { await client.close(); }
})();
