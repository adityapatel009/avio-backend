const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const Product = require('../models/Product');
const SearchLog = require('../models/SearchLog');
const Order = require('../models/Order');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

// ─── SYNONYMS MAP ─────────────────────────────────────────
const synonyms = {
  'footwear': ['shoes', 'sandals', 'heels', 'boots', 'sneakers', 'slippers'],
  'shoes': ['footwear', 'sandals', 'heels', 'sneakers'],
  'outfit': ['dress', 'suit', 'kurta', 'clothes', 'clothing'],
  'dress': ['outfit', 'frock', 'gown', 'clothes'],
  'top': ['shirt', 't-shirt', 'blouse', 'kurti'],
  'bottom': ['jeans', 'trousers', 'pants', 'skirt', 'leggings'],
  'ethnic': ['kurta', 'saree', 'lehenga', 'salwar', 'anarkali'],
  'western': ['jeans', 'top', 'dress', 'skirt', 'shorts'],
  'watch': ['smartwatch', 'wristwatch', 'timepiece'],
  'bag': ['handbag', 'purse', 'clutch', 'backpack', 'tote'],
  'jewellery': ['jewelry', 'necklace', 'earring', 'bangle', 'ring'],
  'makeup': ['lipstick', 'foundation', 'kajal', 'mascara', 'blush'],
  'skincare': ['moisturizer', 'face wash', 'serum', 'sunscreen'],
  'phone': ['smartphone', 'mobile', 'iphone', 'android'],
  'earphone': ['earbuds', 'headphone', 'airpods', 'earpods'],
};

const expandQuery = (q) => {
  const words = q.toLowerCase().trim().split(/\s+/);
  const expanded = new Set(words);
  words.forEach(word => {
    if (synonyms[word]) synonyms[word].forEach(s => expanded.add(s));
    Object.entries(synonyms).forEach(([key, vals]) => {
      if (vals.includes(word)) expanded.add(key);
    });
  });
  return Array.from(expanded);
};

// ─── IN-MEMORY DEAL OF DAY STORE ──────────────────────────
// { productId, dealPrice, endsAt, setBy: 'admin'|'auto' }
let dealOfDay = null;

const getAutoDeal = async () => {
  try {
    // Top rated ya trending product select karo
    const product = await Product.findOne({
      stock: { $gt: 0 },
      originalPrice: { $exists: true },
      $expr: { $gt: ['$originalPrice', '$sellingPrice'] }
    }).sort({ averageRating: -1, viewCount: -1 }).select('-meeshoPrice');
    if (!product) return null;
    const midnight = new Date();
    midnight.setHours(23, 59, 59, 999);
    return {
      productId: product._id.toString(),
      dealPrice: Math.round(product.sellingPrice * 0.85), // extra 15% off
      endsAt: midnight.toISOString(),
      setBy: 'auto',
      product,
    };
  } catch { return null; }
};

// ─────────────────────────────────────────
// @route   GET /api/products/deal-of-day
// @access  Public
// ─────────────────────────────────────────
// routes/products.js mein SIRF deal-of-day GET route replace karo
// Dhundo: router.get('/deal-of-day', async (req, res) => {
// Poora route replace karo is se:

router.get('/deal-of-day', async (req, res) => {
  try {
    // Expired check
    if (dealOfDay && new Date(dealOfDay.endsAt) < new Date()) {
      dealOfDay = null;
    }
    // Sirf admin set deal dikhao — auto deal nahi
    if (!dealOfDay) return res.json({ deal: null });

    const product = await Product.findById(dealOfDay.productId).select('-meeshoPrice');
    if (!product) {
      dealOfDay = null;
      return res.json({ deal: null });
    }
    res.json({ deal: { ...dealOfDay, product }, endsAt: dealOfDay.endsAt });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Spin wheel on/off + prizes — in-memory store
// Ye bhi products.js mein add karo — deal-of-day routes ke paas

let spinWheelConfig = {
  isActive: true,
  prizes: [
    { label: '5% OFF', code: 'SPIN5', discount: 5, type: 'percent', color: '#6C3AE8', probability: 30 },
    { label: '10% OFF', code: 'SPIN10', discount: 10, type: 'percent', color: '#C084FC', probability: 25 },
    { label: 'Free Delivery', code: 'FREEDEL', discount: 49, type: 'flat', color: '#22C55E', probability: 20 },
    { label: '15% OFF', code: 'SPIN15', discount: 15, type: 'percent', color: '#F97316', probability: 12 },
    { label: '20% OFF', code: 'SPIN20', discount: 20, type: 'percent', color: '#EAB308', probability: 8 },
    { label: 'Better Luck!', code: null, discount: 0, type: 'none', color: '#4B5563', probability: 5 },
  ]
};

// GET spin config
router.get('/spin-config', async (req, res) => {
  res.json({ config: spinWheelConfig });
});

// POST spin config — admin
router.post('/spin-config', adminOnly, async (req, res) => {
  try {
    const { isActive, prizes } = req.body;
    if (typeof isActive === 'boolean') spinWheelConfig.isActive = isActive;
    if (prizes && Array.isArray(prizes)) spinWheelConfig.prizes = prizes;
    res.json({ message: 'Spin config update ho gaya!', config: spinWheelConfig });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────
// @route   POST /api/products/deal-of-day
// @desc    Admin — Deal of Day set karo
// @access  Admin
// ─────────────────────────────────────────
router.post('/deal-of-day', adminOnly, async (req, res) => {
  try {
    const { productId, dealPrice } = req.body;
    if (!productId || !dealPrice) return res.status(400).json({ message: 'productId aur dealPrice zaroori hai' });

    const product = await Product.findById(productId).select('-meeshoPrice');
    if (!product) return res.status(404).json({ message: 'Product nahi mila' });

    const midnight = new Date();
    midnight.setHours(23, 59, 59, 999);

    dealOfDay = {
      productId,
      dealPrice: Number(dealPrice),
      endsAt: midnight.toISOString(),
      setBy: 'admin',
    };

    res.json({ message: 'Deal of Day set ho gaya! 🔥', deal: { ...dealOfDay, product } });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────
// @route   DELETE /api/products/deal-of-day
// @desc    Admin — Deal of Day remove karo
// @access  Admin
// ─────────────────────────────────────────
router.delete('/deal-of-day', adminOnly, async (req, res) => {
  try {
    dealOfDay = null;
    res.json({ message: 'Deal of Day remove ho gaya!' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────
// @route   GET /api/products
// @access  Public
// ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category, subCategory, minPrice, maxPrice, rating, sort, page = 1, limit = 12 } = req.query;
    let filter = {};
    if (category) filter.category = category;
    if (subCategory) filter.subCategory = subCategory;
    if (minPrice || maxPrice) {
      filter.sellingPrice = {};
      if (minPrice) filter.sellingPrice.$gte = Number(minPrice);
      if (maxPrice) filter.sellingPrice.$lte = Number(maxPrice);
    }
    if (rating) filter.averageRating = { $gte: Number(rating) };
    let sortOption = {};
    if (sort === 'price_low') sortOption.sellingPrice = 1;
    else if (sort === 'price_high') sortOption.sellingPrice = -1;
    else if (sort === 'rating') sortOption.averageRating = -1;
    else if (sort === 'newest') sortOption.createdAt = -1;
    else if (sort === 'popular') sortOption.viewCount = -1;
    else sortOption.createdAt = -1;
    const skip = (page - 1) * limit;
    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter).sort(sortOption).skip(skip).limit(Number(limit)).select('-meeshoPrice');
    res.json({ products, currentPage: Number(page), totalPages: Math.ceil(total / limit), totalProducts: total });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/trending', async (req, res) => {
  try {
    const products = await Product.find().sort({ viewCount: -1 }).limit(8).select('-meeshoPrice');
    res.json({ products });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/featured', async (req, res) => {
  try {
    const products = await Product.find({ isFeatured: true }).limit(8).select('-meeshoPrice');
    res.json({ products });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ message: 'Search query daalo' });
    const trimmedQ = q.trim();
    const words = trimmedQ.split(/\s+/).filter(Boolean);
    let products = [];
    try {
      let searchQuery;
      if (words.length === 1) {
        searchQuery = {
          compound: {
            should: [
              { text: { query: trimmedQ, path: 'name', fuzzy: { maxEdits: 1, prefixLength: 2 }, score: { boost: { value: 5 } } } },
              { text: { query: trimmedQ, path: 'tags', fuzzy: { maxEdits: 1 }, score: { boost: { value: 4 } } } },
              { text: { query: trimmedQ, path: 'subCategory', fuzzy: { maxEdits: 1 }, score: { boost: { value: 3 } } } },
            ],
            minimumShouldMatch: 1
          }
        };
      } else {
        const mustClauses = words.map(word => ({
          text: { query: word, path: ['name', 'tags', 'subCategory'], fuzzy: { maxEdits: 1, prefixLength: 2 } }
        }));
        searchQuery = {
          compound: {
            must: mustClauses,
            should: [{ phrase: { query: trimmedQ, path: 'name', score: { boost: { value: 5 } } } }]
          }
        };
      }
      const atlasResults = await Product.aggregate([
        { $search: { index: 'product_search', ...searchQuery } },
        { $addFields: { searchScore: { $meta: 'searchScore' } } },
        { $sort: { searchScore: -1 } },
        { $limit: 20 },
        { $project: { meeshoPrice: 0 } }
      ]);
      products = atlasResults;
    } catch (atlasErr) {
      console.log('Atlas search failed, using fallback:', atlasErr.message);
    }
    if (products.length === 0) {
      const expandedWords = new Set(words);
      words.forEach(word => {
        const w = word.toLowerCase();
        if (synonyms[w]) synonyms[w].forEach(s => expandedWords.add(s));
        Object.entries(synonyms).forEach(([key, vals]) => { if (vals.includes(w)) expandedWords.add(key); });
      });
      const andConditions = words.map(word => ({
        $or: [
          { name: { $regex: word, $options: 'i' } },
          { tags: { $in: [new RegExp(word, 'i')] } },
          { subCategory: { $regex: word, $options: 'i' } },
        ]
      }));
      products = await Product.find({ $and: andConditions }).select('-meeshoPrice').limit(20);
      if (products.length === 0) {
        const synonymExpanded = Array.from(expandedWords);
        const orConditions = synonymExpanded.flatMap(term => [
          { name: { $regex: term, $options: 'i' } },
          { tags: { $in: [new RegExp(term, 'i')] } },
          { subCategory: { $regex: term, $options: 'i' } },
        ]);
        products = await Product.find({ $or: orConditions }).select('-meeshoPrice').limit(20);
      }
    }
    try {
      await SearchLog.create({ keyword: trimmedQ.toLowerCase(), userId: req.user ? req.user._id : null, resultsFound: products.length });
    } catch (logErr) {}
    res.json({ products, totalFound: products.length, keyword: trimmedQ });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/autocomplete', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ suggestions: [] });
    let suggestions = [];
    try {
      const results = await Product.aggregate([
        { $search: { index: 'product_search', autocomplete: { query: q, path: 'name', fuzzy: { maxEdits: 1 }, tokenOrder: 'sequential' } } },
        { $limit: 6 },
        { $project: { name: 1, images: 1, sellingPrice: 1, category: 1, subCategory: 1 } }
      ]);
      suggestions = results;
    } catch (atlasErr) {
      suggestions = await Product.find({ name: { $regex: q, $options: 'i' } }).limit(6).select('name images sellingPrice category subCategory');
    }
    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ suggestions: [] });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select('-meeshoPrice').populate('variants.productId', 'name images sellingPrice variants');
    if (!product) return res.status(404).json({ message: 'Product nahi mila' });
    await Product.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });
    const relatedProducts = await Product.find({ category: product.category, _id: { $ne: product._id } }).limit(6).select('-meeshoPrice');
    res.json({ product, relatedProducts });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/:id/review', protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product nahi mila' });
    const alreadyReviewed = product.reviews.find(r => r.user.toString() === req.user._id.toString());
    if (alreadyReviewed) return res.status(400).json({ message: 'Tumne pehle se review de diya hai' });
    product.reviews.push({ user: req.user._id, userName: req.user.name, rating: Number(rating), comment });
    product.totalReviews = product.reviews.length;
    product.averageRating = product.reviews.reduce((acc, r) => acc + r.rating, 0) / product.reviews.length;
    await product.save();
    res.status(201).json({ message: 'Review add ho gaya!' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', adminOnly, async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json({ message: 'Product add ho gaya!', product });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!product) return res.status(404).json({ message: 'Product nahi mila' });
    try {
      const orders = await Order.find({
        'items.product': product._id,
        status: { $in: ['Pending', 'Confirmed', 'Processing'] }
      }).populate('customer', 'name email');
      for (const order of orders) {
        if (!order.customer?.email) continue;
        await transporter.sendMail({
          from: `"Avio ✨" <${process.env.GMAIL_USER}>`,
          to: order.customer.email,
          subject: `🔔 Product Update — Your Order #${order.orderId} | Avio`,
          html: `<body style="margin:0;padding:0;background:#0f0f1a;font-family:Arial,sans-serif;"><div style="max-width:560px;margin:40px auto;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:16px;overflow:hidden;"><div style="background:linear-gradient(135deg,#6C3AE8,#C084FC);padding:28px;text-align:center;"><div style="font-size:16px;font-weight:900;letter-spacing:4px;color:#fff;">AVIO</div><h1 style="color:#fff;margin:8px 0 0;font-size:22px;">Product Updated 🔔</h1></div><div style="padding:28px;"><p style="color:#aaa;font-size:14px;">Hi <strong style="color:#fff;">${order.customer.name}</strong>, a product in your order <strong style="color:#C084FC;">#${order.orderId}</strong> has been updated.</p><div style="background:#12121E;border:1px solid #6C3AE8;border-radius:12px;padding:16px;margin:20px 0;"><p style="color:#fff;font-size:14px;font-weight:bold;margin:0 0 4px;">${product.name}</p><p style="color:#C084FC;font-size:13px;margin:0;">₹${product.sellingPrice}</p></div><div style="text-align:center;"><a href="${process.env.FRONTEND_URL}/orders" style="display:inline-block;background:linear-gradient(135deg,#6C3AE8,#C084FC);color:#fff;padding:12px 28px;border-radius:10px;font-weight:bold;text-decoration:none;">View My Orders</a></div></div><div style="background:#12121E;padding:16px;text-align:center;border-top:1px solid #2a2a3e;"><p style="color:#555;font-size:12px;margin:0;">© 2026 Avio. Made with ❤️ in India</p></div></div></body>`,
        });
      }
    } catch (emailErr) { console.log('Product update email error:', emailErr.message); }
    res.json({ message: 'Product update ho gaya!', product });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product nahi mila' });
    res.json({ message: 'Product delete ho gaya!' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id/flashsale', adminOnly, async (req, res) => {
  try {
    const { isActive, salePrice, endsAt } = req.body;
    const product = await Product.findByIdAndUpdate(req.params.id, { flashSale: { isActive, salePrice, endsAt } }, { new: true });
    res.json({ message: 'Flash sale update ho gayi!', product });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;