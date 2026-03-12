const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const SearchLog = require('../models/SearchLog');
const { protect, adminOnly } = require('../middleware/auth');

// ─────────────────────────────────────────
// @route   GET /api/products
// @desc    Sabhi products fetch karo
// @access  Public
// ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category, minPrice, maxPrice, rating, sort, page = 1, limit = 12 } = req.query;

    // Filter object banao
    let filter = {};

    if (category) filter.category = category;
    if (minPrice || maxPrice) {
      filter.sellingPrice = {};
      if (minPrice) filter.sellingPrice.$gte = Number(minPrice);
      if (maxPrice) filter.sellingPrice.$lte = Number(maxPrice);
    }
    if (rating) filter.averageRating = { $gte: Number(rating) };

    // Sort options
    let sortOption = {};
    if (sort === 'price_low') sortOption.sellingPrice = 1;
    else if (sort === 'price_high') sortOption.sellingPrice = -1;
    else if (sort === 'rating') sortOption.averageRating = -1;
    else if (sort === 'newest') sortOption.createdAt = -1;
    else if (sort === 'popular') sortOption.viewCount = -1;
    else sortOption.createdAt = -1;

    const skip = (page - 1) * limit;
    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .select('-meeshoPrice'); // meeshoPrice customer ko nahi dikhega

    res.json({
      products,
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      totalProducts: total
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────
// @route   GET /api/products/trending
// @desc    Top viewed products — homepage ke liye
// @access  Public
// ─────────────────────────────────────────
router.get('/trending', async (req, res) => {
  try {
    const products = await Product.find()
      .sort({ viewCount: -1 })
      .limit(8)
      .select('-meeshoPrice');

    res.json({ products });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────
// @route   GET /api/products/featured
// @desc    Featured products
// @access  Public
// ─────────────────────────────────────────
router.get('/featured', async (req, res) => {
  try {
    const products = await Product.find({ isFeatured: true })
      .limit(8)
      .select('-meeshoPrice');

    res.json({ products });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────
// @route   GET /api/products/search
// @desc    Smart search + keyword log
// @access  Public
// ─────────────────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ message: 'Search query daalo' });
    }

    // Search karo — name, description, tags mein
    const products = await Product.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } },
        { category: { $regex: q, $options: 'i' } }
      ]
    }).select('-meeshoPrice').limit(20);

    // Search log silently save karo — analytics ke liye
    try {
      await SearchLog.create({
        keyword: q.toLowerCase(),
        userId: req.user ? req.user._id : null,
        resultsFound: products.length
      });
    } catch (logError) {
      // Log fail ho to koi baat nahi — search result to do
    }

    res.json({
      products,
      totalFound: products.length,
      keyword: q
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────
// @route   GET /api/products/:id
// @desc    Single product detail + view count++
// @access  Public
// ─────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .select('-meeshoPrice')
      .populate('variants.productId', 'name images sellingPrice variants');

    if (!product) {
      return res.status(404).json({ message: 'Product nahi mila' });
    }

    // View count silently badhao
    await Product.findByIdAndUpdate(req.params.id, {
      $inc: { viewCount: 1 }
    });

    // Related products — same category ke
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id }
    })
      .limit(6)
      .select('-meeshoPrice');

    res.json({ product, relatedProducts });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────
// @route   POST /api/products/:id/review
// @desc    Product review add karo
// @access  Private (login zaroori)
// ─────────────────────────────────────────
router.post('/:id/review', protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product nahi mila' });
    }

    // Kya is user ne pehle review diya hai?
    const alreadyReviewed = product.reviews.find(
      r => r.user.toString() === req.user._id.toString()
    );

    if (alreadyReviewed) {
      return res.status(400).json({ message: 'Tumne pehle se review de diya hai' });
    }

    // Review add karo
    product.reviews.push({
      user: req.user._id,
      userName: req.user.name,
      rating: Number(rating),
      comment
    });

    // Average rating update karo
    product.totalReviews = product.reviews.length;
    product.averageRating = product.reviews.reduce(
      (acc, r) => acc + r.rating, 0
    ) / product.reviews.length;

    await product.save();

    res.status(201).json({ message: 'Review add ho gaya!' });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────

// @route   POST /api/products
// @desc    Naya product add karo (Admin only)
// @access  Admin
router.post('/', adminOnly, async (req, res) => {
  try {
    const {
      name, description, images, category,
      meeshoPrice, sellingPrice, originalPrice,
      stock, tags, isFeatured, isNewArrival
    } = req.body;

    const product = await Product.create({
      name, description, images, category,
      meeshoPrice, sellingPrice, originalPrice,
      stock, tags, isFeatured, isNewArrival
    });

    res.status(201).json({
      message: 'Product add ho gaya!',
      product
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/products/:id
// @desc    Product update karo (Admin only)
// @access  Admin
router.put('/:id', adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: 'Product nahi mila' });
    }

    res.json({ message: 'Product update ho gaya!', product });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/products/:id
// @desc    Product delete karo (Admin only)
// @access  Admin
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product nahi mila' });
    }

    res.json({ message: 'Product delete ho gaya!' });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/products/:id/flashsale
// @desc    Flash sale set karo (Admin only)
// @access  Admin
router.put('/:id/flashsale', adminOnly, async (req, res) => {
  try {
    const { isActive, salePrice, endsAt } = req.body;

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { flashSale: { isActive, salePrice, endsAt } },
      { new: true }
    );

    res.json({ message: 'Flash sale update ho gayi!', product });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;