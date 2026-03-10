const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({

  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,  // automatically capital mein save hoga
    trim: true
  },

  discountType: {
    type: String,
    enum: ['percentage', 'flat'],
    required: true
    // percentage = 10% off
    // flat = Rs. 50 off
  },

  discountValue: {
    type: Number,
    required: true
  },

  minOrderValue: {
    type: Number,
    default: 0  // Minimum kitne ka order ho
  },

  maxDiscount: {
    type: Number  // Max kitna discount milega (percentage wale ke liye)
  },

  expiryDate: {
    type: Date,
    required: true
  },

  isActive: {
    type: Boolean,
    default: true
  },

  usageCount: {
    type: Number,
    default: 0  // Kitni baar use hua
  }

}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);