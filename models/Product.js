const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({

  name: {
    type: String,
    required: [true, 'Product naam zaroori hai'],
    trim: true
  },

  description: {
    type: String,
    required: [true, 'Description zaroori hai']
  },

  images: [{ type: String }],

  category: {
    type: String,
    required: [true, 'Category zaroori hai'],
    enum: [
      'Women', 'Men', 'Electronics',
      'Home Decor', 'Beauty', 'Footwear',
      'Jewellery & Accessories', 'Sports & Fitness',
      'Kids', 'Toys', 'Books', 'Food', 'Other'
    ]
  },

  // Size type — system ko batata hai konsa size chart use karo
  sizeType: {
    type: String,
    enum: ['clothing', 'innerwear', 'bra', 'bottom', 'footwear', 'free', 'none'],
    default: 'none'
  },

  // Available sizes for this product (admin select karega)
  availableSizes: [{ type: String }],

  meeshoPrice: { type: Number, required: true },
  sellingPrice: { type: Number, required: true },
  originalPrice: { type: Number, required: true },
  stock: { type: Number, required: true, default: 0 },

  tags: [String],
  features: [String],
  brand: { type: String },
  video: { type: String },

  viewCount: { type: Number, default: 0 },
  wishlistCount: { type: Number, default: 0 },
  cartCount: { type: Number, default: 0 },
  totalSold: { type: Number, default: 0 },

  flashSale: {
    isActive: { type: Boolean, default: false },
    salePrice: { type: Number },
    endsAt: { type: Date }
  },

  isFeatured: { type: Boolean, default: false },
  isNewArrival: { type: Boolean, default: false },
  isTrending: { type: Boolean, default: false },

  averageRating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 }

}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);