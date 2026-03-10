const mongoose = require('mongoose');

const notificationTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  subscribedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('NotificationToken', notificationTokenSchema);