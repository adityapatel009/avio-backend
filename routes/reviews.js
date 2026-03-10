const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');
const multer = require('multer');
const { cloudinary } = require('../config/cloudinary');

// ── Multer memory storage ──
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Sirf images upload kar sakte ho!'), false);
  }
});

// ── Cloudinary upload helper ──
const uploadToCloudinary = (buffer, folder = 'avio-reviews') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', transformation: [{ width: 800, quality: 'auto' }] },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

// ── Fixed starter reviews ──
const fixedReviews = (productId) => [
  { product: productId, rating: 5, title: 'Bahut achha product!', comment: 'Quality ekdum mast hai, delivery bhi fast aayi. Packaging bhi proper thi. Highly recommend!', isFixed: true, isVerifiedPurchase: true, userName: 'Rahul S.', userInitial: 'R', helpful: 12, createdAt: new Date('2024-11-15') },
  { product: productId, rating: 4, title: 'Good value for money', comment: 'Price ke hisaab se bahut badhiya hai. Color thoda alag tha photo se but overall satisfied hoon.', isFixed: true, isVerifiedPurchase: true, userName: 'Priya M.', userInitial: 'P', helpful: 8, createdAt: new Date('2024-11-20') },
  { product: productId, rating: 5, title: 'Excellent!', comment: 'Superb quality. Already ordered 2 more for family. Avio se hamesha acha milta hai.', isFixed: true, isVerifiedPurchase: true, userName: 'Amit K.', userInitial: 'A', helpful: 15, createdAt: new Date('2024-12-01') },
  { product: productId, rating: 3, title: 'Theek hai', comment: 'Average product hai. Quality thodi better ho sakti thi but price ke liye okay hai.', isFixed: true, isVerifiedPurchase: false, userName: 'Sneha R.', userInitial: 'S', helpful: 3, createdAt: new Date('2024-12-10') },
  { product: productId, rating: 5, title: 'Mind blowing quality', comment: 'Socha nahi tha itna acha hoga! Photos se bhi better lag raha hai. Fast delivery aur proper packaging.', isFixed: true, isVerifiedPurchase: true, userName: 'Vikram T.', userInitial: 'V', helpful: 20, createdAt: new Date('2024-12-18') },
  { product: productId, rating: 4, title: 'Happy with purchase', comment: 'Good product. Size accurate hai. Color ekdum waisa hi hai jaise website par dikh raha tha.', isFixed: true, isVerifiedPurchase: true, userName: 'Anita D.', userInitial: 'A', helpful: 6, createdAt: new Date('2025-01-05') },
  { product: productId, rating: 5, title: 'Best purchase!', comment: 'Mere bhai ke liye liya tha, usey bahut pasand aaya. Definitely buying again from Avio!', isFixed: true, isVerifiedPurchase: true, userName: 'Rohit P.', userInitial: 'R', helpful: 9, createdAt: new Date('2025-01-12') },
  { product: productId, rating: 4, title: 'Nice product', comment: 'Overall good experience. Product quality is good and matches description. Would recommend.', isFixed: true, isVerifiedPurchase: true, userName: 'Kavya N.', userInitial: 'K', helpful: 4, createdAt: new Date('2025-01-20') },
];

// ════════════════════════════════════════════════════
// GET /api/reviews/:productId — sabke reviews
// ════════════════════════════════════════════════════
router.get('/:productId', async (req, res) => {
  try {
    const realReviews = await Review.find({ product: req.params.productId })
      .populate('user', 'name')
      .sort({ createdAt: -1 });

    const fixed = fixedReviews(req.params.productId);
    const allReviews = [
      ...realReviews.map(r => ({
        _id: r._id,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        photos: r.photos || [],
        helpful: r.helpful.length,
        notHelpful: r.notHelpful.length,
        isVerifiedPurchase: r.isVerifiedPurchase,
        isFixed: false,
        userName: r.user?.name || 'User',
        userInitial: (r.user?.name || 'U').charAt(0).toUpperCase(),
        adminReply: r.adminReply,
        createdAt: r.createdAt,
      })),
      ...fixed,
    ];

    const ratings = allReviews.map(r => r.rating);
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const ratingBreakdown = [5,4,3,2,1].map(star => ({
      star,
      count: ratings.filter(r => r === star).length,
      percent: Math.round((ratings.filter(r => r === star).length / ratings.length) * 100)
    }));

    res.json({ reviews: allReviews, totalReviews: allReviews.length, avgRating: parseFloat(avgRating.toFixed(1)), ratingBreakdown });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ════════════════════════════════════════════════════
// GET /api/reviews/check/:productId — user ne review diya ya nahi
// ════════════════════════════════════════════════════
router.get('/check/:productId', protect, async (req, res) => {
  try {
    // Delivered order hai?
    const order = await Order.findOne({
      customer: req.user._id,
      'items.product': req.params.productId,
      status: 'Delivered',
    });

    // Already reviewed?
    const existing = await Review.findOne({
      product: req.params.productId,
      user: req.user._id,
    });

    res.json({
      canReview: !!order && !existing,
      hasReviewed: !!existing,
      hasDeliveredOrder: !!order,
      orderId: order?._id || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ════════════════════════════════════════════════════
// GET /api/reviews/pending/:userId — delivered orders jinpe review nahi diya
// ════════════════════════════════════════════════════
router.get('/pending/:userId', protect, async (req, res) => {
  try {
    if (req.user._id.toString() !== req.params.userId)
      return res.status(403).json({ message: 'Unauthorized!' });

    // User ke sabhi delivered orders
    const deliveredOrders = await Order.find({
      customer: req.user._id,
      status: 'Delivered',
    });

    // Already diye hue reviews
    const userReviews = await Review.find({ user: req.user._id }).select('product');
    const reviewedProducts = userReviews.map(r => r.product.toString());

    // Pending review items
    const pendingItems = [];
    for (const order of deliveredOrders) {
      for (const item of order.items) {
        if (!reviewedProducts.includes(item.product?.toString())) {
          pendingItems.push({
            orderId: order._id,
            orderDisplayId: order.orderId,
            productId: item.product,
            productName: item.productName,
            productImage: item.productImage,
            deliveredAt: order.updatedAt,
          });
        }
      }
    }

    res.json({ pendingItems });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ════════════════════════════════════════════════════
// POST /api/reviews/:productId — review submit (with image upload)
// ════════════════════════════════════════════════════
router.post('/:productId', protect, upload.array('photos', 3), async (req, res) => {
  try {
    const { rating, title, comment, orderId } = req.body;

    // Delivered order check
    const orderQuery = {
      customer: req.user._id,
      'items.product': req.params.productId,
      status: 'Delivered',
    };
    if (orderId) orderQuery._id = orderId;

    const order = await Order.findOne(orderQuery);
    if (!order) {
      return res.status(403).json({ message: 'Sirf delivered order ke baad review de sakte ho!' });
    }

    // Already reviewed check
    const existing = await Review.findOne({ product: req.params.productId, user: req.user._id });
    if (existing) {
      return res.status(400).json({ message: 'Aapne pehle se is product ka review diya hua hai!' });
    }

    // Upload images to Cloudinary
    let photoUrls = [];
    if (req.files && req.files.length > 0) {
      photoUrls = await Promise.all(req.files.map(file => uploadToCloudinary(file.buffer)));
    }

    // JSON photos (URL strings) — fallback
    if (req.body.photos && photoUrls.length === 0) {
      try {
        const parsed = JSON.parse(req.body.photos);
        if (Array.isArray(parsed)) photoUrls = parsed;
      } catch {}
    }

    const review = await Review.create({
      product: req.params.productId,
      user: req.user._id,
      order: order._id,
      rating: parseInt(rating),
      title: title || '',
      comment,
      photos: photoUrls,
      isVerifiedPurchase: true,
    });

    // Product ka averageRating update karo
    const allReviews = await Review.find({ product: req.params.productId });
    const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    await Product.findByIdAndUpdate(req.params.productId, {
      averageRating: parseFloat(avg.toFixed(1)),
      totalReviews: allReviews.length,
    });

    res.status(201).json({ message: 'Review submit ho gaya! Shukriya! 🙏', review });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ════════════════════════════════════════════════════
// PUT /api/reviews/:id/helpful
// ════════════════════════════════════════════════════
router.put('/:id/helpful', protect, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review nahi mila!' });
    if (!review.helpful.includes(req.user._id)) {
      review.helpful.push(req.user._id);
      review.notHelpful = review.notHelpful.filter(id => id.toString() !== req.user._id.toString());
    }
    await review.save();
    res.json({ helpful: review.helpful.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ════════════════════════════════════════════════════
// PUT /api/reviews/:id/nothelpful
// ════════════════════════════════════════════════════
router.put('/:id/nothelpful', protect, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review nahi mila!' });
    if (!review.notHelpful.includes(req.user._id)) {
      review.notHelpful.push(req.user._id);
      review.helpful = review.helpful.filter(id => id.toString() !== req.user._id.toString());
    }
    await review.save();
    res.json({ notHelpful: review.notHelpful.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ════════════════════════════════════════════════════
// ADMIN — GET all reviews
// ════════════════════════════════════════════════════
router.get('/admin/all', protect, adminOnly, async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate('user', 'name email')
      .populate('product', 'name images')
      .sort({ createdAt: -1 });
    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ADMIN — Reply / Edit review
router.put('/admin/:id', protect, adminOnly, async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ message: 'Review update ho gaya!', review });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ADMIN — Delete review
router.delete('/admin/:id', protect, adminOnly, async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ message: 'Review delete ho gaya!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;