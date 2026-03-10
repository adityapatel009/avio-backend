const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    sparse: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deliveryAddress: {
    fullName: String,
    phone: String,
    addressLine: String,
    city: String,
    state: String,
    pincode: String
  },
  items: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      productName: String,
      productImage: String,
      quantity: Number,
      price: Number
    }
  ],
  totalAmount: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  finalAmount: { type: Number, required: true },
  couponUsed: { type: String, default: null },
  paymentMethod: { type: String, default: 'COD' },
  status: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
    default: 'Pending'
  },
  statusHistory: [
    {
      status: String,
      note: String,
      updatedAt: Date
    }
  ],
  meeshoOrderId: { type: String, default: null },
  expectedDelivery: { type: Date, default: null },

  // ── RETURN REQUEST ────────────────────────────────────
  returnRequest: {
    status: {
      type: String,
      enum: ['None', 'Pending', 'Accepted', 'Rejected'],
      default: 'None'
    },
    reason: { type: String, default: null },
    description: { type: String, default: null },
    images: [{ type: String }],
    adminNote: { type: String, default: null },
    requestedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
  }

}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);