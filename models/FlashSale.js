
const mongoose = require('mongoose');

const flashSaleSchema = new mongoose.Schema({
  title:     { type: String, default: 'Flash Sale' },
  discount:  { type: Number, default: 40 },
  code:      { type: String, default: 'FLASH40' },
  endTime:   { type: Date, required: true },
  isActive:  { type: Boolean, default: true },
  message:   { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('FlashSale', flashSaleSchema);

