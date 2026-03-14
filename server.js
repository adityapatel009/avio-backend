const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const passport = require('passport');
const flashSaleRoutes = require('./routes/flashsale');
const notificationRoutes = require('./routes/notifications');

dotenv.config();

const app = express();

app.use(cors({
  origin: [
    'http://localhost:3000',
    process.env.FRONTEND_URL,
  ],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/flashsale', flashSaleRoutes);
app.use('/api/notifications', notificationRoutes);

// Passport initialize
app.use(passport.initialize());

// Models
require('./models/User');
require('./models/Product');
require('./models/Order');
require('./models/Coupon');
require('./models/SearchLog');
require('./models/AbandonedCart');  // ← NEW

// Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const reviewRoutes = require('./routes/reviews');
const uploadRoutes = require('./routes/upload');
const cartRoutes = require('./routes/cart');  // ← NEW

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/cart', cartRoutes);  // ← NEW

app.get('/', (req, res) => res.json({ message: '👑 Avio Backend chal raha hai!', status: 'OK' }));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB se connection ho gaya!');

    // ── ABANDONED CART CRON — har ghante chalega ──
    const { sendAbandonedCartEmails } = require('./routes/cart');
    setInterval(async () => {
      console.log('🔄 Abandoned cart check chal raha hai...');
      await sendAbandonedCartEmails();
    }, 60 * 60 * 1000); // har 1 ghante mein

    // Startup pe bhi ek baar chalao
    setTimeout(sendAbandonedCartEmails, 10000);
  })
  .catch((error) => console.log('❌ MongoDB connection failed:', error.message));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server chal raha hai port ${PORT} par`));