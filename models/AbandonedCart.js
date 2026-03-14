const mongoose = require('mongoose');

const abandonedCartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  email: { type: String, required: true },
  name: { type: String, required: true },
  items: [{
    productId: String,
    name: String,
    image: String,
    price: Number,
    quantity: Number,
    selectedSize: String,
  }],
  total: { type: Number, default: 0 },
  // Email tracking
  reminder1Sent: { type: Boolean, default: false },  // 1hr
  reminder2Sent: { type: Boolean, default: false },  // 24hr
  reminder3Sent: { type: Boolean, default: false },  // 48hr
  // Recovered = user ne order place kar diya
  isRecovered: { type: Boolean, default: false },
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('AbandonedCart', abandonedCartSchema);