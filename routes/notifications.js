const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const NotificationToken = require('../models/NotificationToken');
const jwt = require('jsonwebtoken');

// ── Firebase lazy init ──
const initFirebase = () => {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
};

// ── Admin middleware ──
const isAdmin = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Admin only!' });
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token!' });
  }
};

// POST /api/notifications/subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Token chahiye!' });

    let userId = null;
    try {
      const authToken = req.headers.authorization?.split(' ')[1];
      if (authToken) {
        const decoded = jwt.verify(authToken, process.env.JWT_SECRET);
        userId = decoded.id !== 'admin' ? decoded.id : null;
      }
    } catch {}

    await NotificationToken.findOneAndUpdate(
      { token },
      { token, userId, subscribedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({ message: 'Subscribed! 🔔' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/notifications/stats
router.get('/stats', isAdmin, async (req, res) => {
  try {
    const total = await NotificationToken.countDocuments();
    res.json({ total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/notifications/send
router.post('/send', isAdmin, async (req, res) => {
  initFirebase();
  try {
    const { title, body, image, url } = req.body;
    if (!title || !body) return res.status(400).json({ message: 'Title aur body chahiye!' });

    const tokenDocs = await NotificationToken.find().select('token');
    const tokens = tokenDocs.map(t => t.token).filter(Boolean);

    if (tokens.length === 0)
      return res.status(400).json({ message: 'Koi subscriber nahi hai!' });

    const message = {
      notification: { title, body, ...(image && { imageUrl: image }) },
      data: { url: url || '/' },
      webpush: {
        notification: {
          title, body, icon: '/logo192.png',
          ...(image && { image }),
          actions: [{ action: 'open', title: '🛍 Shop Now' }]
        },
        fcmOptions: {
          link: url || process.env.FRONTEND_URL || 'http://localhost:3000'
        }
      },
      tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // Failed tokens delete karo
    const failedTokens = [];
    response.responses.forEach((r, i) => {
      if (!r.success) failedTokens.push(tokens[i]);
    });
    if (failedTokens.length > 0) {
      await NotificationToken.deleteMany({ token: { $in: failedTokens } });
    }

    res.json({
      message: 'Notification bhej diya! ✅',
      sent: response.successCount,
      failed: response.failureCount,
      total: tokens.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;