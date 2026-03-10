const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, trim: true },
  comment: { type: String, required: true, trim: true },
  photos: [{ type: String }],
  helpful: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  notHelpful: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isVerifiedPurchase: { type: Boolean, default: false },
  isFixed: { type: Boolean, default: false }, // starter reviews
  adminReply: { type: String, default: null },
}, { timestamps: true });

reviewSchema.index({ product: 1, user: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Review', reviewSchema);