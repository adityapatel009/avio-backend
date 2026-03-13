const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const Product = require('../models/Product');
const SearchLog = require('../models/SearchLog');
const Order = require('../models/Order');
const User = require('../models/User');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

// ─────────────────────────────────────────
// @route   GET /api/products
// @desc    Sabhi products fetch karo
// @access  Public
// ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category, subCategory, minPrice, maxPrice, rating, sort, page = 1, limit = 12 } = req.query;

    // Filter object banao
    let filter = {};

    if (category) filter.category = category;
    if (subCategory) filter.subCategory = subCategory;
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
        { category: { $regex: q, $options: 'i' } },
        { subCategory: { $regex: q, $options: 'i' } },
        { name: { $regex: q.split(' ').join('|'), $options: 'i' } }
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
    const product = await Product.create(req.body);

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

    // ── Product wale orders dhundo, unke users ko email bhejo ──
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
          html: `
            <!DOCTYPE html><html><head><meta charset="UTF-8"></head>
            <body style="margin:0;padding:0;background:#0f0f1a;font-family:Arial,sans-serif;">
              <div style="max-width:560px;margin:40px auto;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:16px;overflow:hidden;">
                <div style="background:linear-gradient(135deg,#6C3AE8,#C084FC);padding:28px;text-align:center;">
                  <div style="font-size:16px;font-weight:900;letter-spacing:4px;color:#fff;margin-bottom:4px;">AVIO</div>
                  <div style="height:2px;width:40px;background:#fff;border-radius:2px;margin:0 auto 12px;"></div>
                  <h1 style="color:#fff;margin:0;font-size:22px;">Product Updated 🔔</h1>
                  <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">Everything Love, One Place</p>
                </div>
                <div style="padding:28px;">
                  <p style="color:#aaa;font-size:14px;margin:0 0 20px;">
                    Hi <strong style="color:#fff;">${order.customer.name}</strong>, a product in your order <strong style="color:#C084FC;">#${order.orderId}</strong> has been updated by Avio.
                  </p>
                  <div style="background:#12121E;border:1px solid #6C3AE8;border-radius:12px;padding:16px;margin-bottom:20px;display:flex;align-items:center;gap:14px;">
                    ${product.images?.[0] ? `<img src="${product.images[0]}" width="60" height="60" style="border-radius:10px;object-fit:cover;" />` : ''}
                    <div>
                      <p style="color:#fff;font-size:14px;font-weight:bold;margin:0 0 4px;">${product.name}</p>
                      <p style="color:#C084FC;font-size:13px;margin:0;">₹${product.sellingPrice}</p>
                    </div>
                  </div>
                  <p style="color:#aaa;font-size:13px;margin:0 0 20px;">
                    If you have any questions about your order, feel free to contact us at <a href="mailto:support@avio.in" style="color:#C084FC;">support@avio.in</a>
                  </p>
                  <div style="text-align:center;">
                    <a href="${process.env.FRONTEND_URL}/orders" style="display:inline-block;background:linear-gradient(135deg,#6C3AE8,#C084FC);color:#fff;padding:12px 28px;border-radius:10px;font-weight:bold;font-size:13px;text-decoration:none;">
                      View My Orders
                    </a>
                  </div>
                </div>
                <div style="background:#12121E;padding:20px;text-align:center;border-top:1px solid #2a2a3e;">
                  <p style="color:#555;font-size:12px;margin:0;">© 2026 Avio. Made with ❤️ in India</p>
                </div>
              </div>
            </body></html>
          `,
        });
      }
    } catch (emailErr) {
      console.log('Product update email error:', emailErr.message);
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