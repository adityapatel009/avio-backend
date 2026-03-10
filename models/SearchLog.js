const mongoose = require('mongoose');

const searchLogSchema = new mongoose.Schema({

  keyword: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },

  // Agar user logged in tha
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  resultsFound: {
    type: Number,
    default: 0
  }

}, { timestamps: true });

module.exports = mongoose.model('SearchLog', searchLogSchema);