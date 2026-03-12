const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose = require('mongoose');
const User = mongoose.model('User');
const SearchLog = require('../models/SearchLog');

// ─── NODEMAILER SETUP ─────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// ─── PASSPORT GOOGLE STRATEGY ────────────────────────────
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ email: profile.emails[0].value });
    if (user) {
      user.googleId = profile.id;
      user.avatar = profile.photos[0]?.value;
      await user.save();
      return done(null, user);
    }
    user = await User.create({
      name: profile.displayName,
      email: profile.emails[0].value,
      googleId: profile.id,
      avatar: profile.photos[0]?.value,
      password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      role: 'user',
      isVerified: true,
    });
    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// ─── HELPER: Generate JWT ─────────────────────────────────
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// ─── HELPER: Send Email ───────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: `"CrownBay 👑" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

// ════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email aur password required hai!' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password kam se kam 6 characters ka hona chahiye!' });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ message: 'Yeh email already registered hai!' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed, phone, role: 'user' });
    const token = generateToken(user);

    res.status(201).json({
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Admin check
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign({ id: 'admin', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({
        token,
        user: { _id: 'admin', name: 'Admin', email: process.env.ADMIN_EMAIL, role: 'admin' },
      });
    }

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: 'Email ya password galat hai!' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: 'Email ya password galat hai!' });

    const token = generateToken(user);
    res.json({
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, avatar: user.avatar },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token nahi mila!' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.id === 'admin') {
      return res.json({ user: { _id: 'admin', name: 'Admin', email: process.env.ADMIN_EMAIL, role: 'admin' } });
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User nahi mila!' });
    res.json({ user });
  } catch (err) {
    res.status(401).json({ message: 'Invalid token!' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email daalo!' });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: 'Is email se koi account nahi mila!' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpire = Date.now() + 60 * 60 * 1000;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    await sendEmail({
      to: user.email,
      subject: '👑 CrownBay — Password Reset Request',
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;background:#0f0f1a;font-family:Arial,sans-serif;">
          <div style="max-width:520px;margin:40px auto;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:16px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#1a1a2e,#12121E);padding:32px;text-align:center;border-bottom:1px solid #2a2a3e;">
              <div style="font-size:32px;margin-bottom:8px;">👑</div>
              <h1 style="color:#C0A060;margin:0;font-size:24px;font-weight:bold;">CrownBay</h1>
              <p style="color:#888;margin:8px 0 0;font-size:14px;">Premium Shopping</p>
            </div>
            <div style="padding:32px;">
              <h2 style="color:#ffffff;margin:0 0 12px;font-size:20px;">Password Reset Request</h2>
              <p style="color:#aaa;font-size:14px;line-height:1.6;margin:0 0 24px;">
                Hi <strong style="color:#fff;">${user.name}</strong>, we received a request to reset your CrownBay password.
              </p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${resetUrl}" style="display:inline-block;background:#C0A060;color:#000;padding:14px 36px;border-radius:12px;font-weight:bold;font-size:15px;text-decoration:none;">
                  Reset My Password
                </a>
              </div>
              <p style="color:#666;font-size:12px;text-align:center;margin:0 0 8px;">This link will expire in <strong style="color:#C0A060;">1 hour</strong></p>
              <p style="color:#666;font-size:12px;text-align:center;margin:0;">If you didn't request this, please ignore this email.</p>
            </div>
            <div style="background:#12121E;padding:20px;text-align:center;border-top:1px solid #2a2a3e;">
              <p style="color:#555;font-size:12px;margin:0;">© 2026 CrownBay. Made with ❤️ in India</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    res.json({ message: 'Password reset link aapki email pe bhej di gayi hai! 📧' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Email bhejne mein error aaya: ' + err.message });
  }
});

// POST /api/auth/reset-password/:token
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6)
      return res.status(400).json({ message: 'Password kam se kam 6 characters ka hona chahiye!' });

    const resetTokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ message: 'Reset link expired ya invalid hai! Dobara try karo.' });

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    await sendEmail({
      to: user.email,
      subject: '✅ CrownBay — Password Successfully Changed',
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#0f0f1a;font-family:Arial,sans-serif;">
          <div style="max-width:520px;margin:40px auto;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:16px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#1a1a2e,#12121E);padding:32px;text-align:center;border-bottom:1px solid #2a2a3e;">
              <div style="font-size:32px;margin-bottom:8px;">✅</div>
              <h1 style="color:#C0A060;margin:0;font-size:24px;">Password Changed!</h1>
            </div>
            <div style="padding:32px;">
              <p style="color:#aaa;font-size:14px;line-height:1.6;">Hi <strong style="color:#fff;">${user.name}</strong>, your password has been successfully changed.</p>
              <p style="color:#aaa;font-size:14px;">If you didn't do this, contact us at <a href="mailto:${process.env.GMAIL_USER}" style="color:#C0A060;">${process.env.GMAIL_USER}</a></p>
              <div style="text-align:center;margin-top:24px;">
                <a href="${process.env.FRONTEND_URL}/login" style="display:inline-block;background:#C0A060;color:#000;padding:12px 32px;border-radius:12px;font-weight:bold;text-decoration:none;">Login Now</a>
              </div>
            </div>
            <div style="background:#12121E;padding:20px;text-align:center;border-top:1px solid #2a2a3e;">
              <p style="color:#555;font-size:12px;margin:0;">© 2026 CrownBay. Made with ❤️ in India</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    res.json({ message: 'Password successfully change ho gaya! Ab login karo. ✅' });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// GET /api/auth/google
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// GET /api/auth/google/callback
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_failed` }),
  (req, res) => {
    const token = generateToken(req.user);
    const user = encodeURIComponent(JSON.stringify({
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      avatar: req.user.avatar,
    }));
    res.redirect(`${process.env.FRONTEND_URL}/auth/google/success?token=${token}&user=${user}`);
  }
);

// ════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════════════

// GET /api/auth/admin/users — All users list
router.get('/admin/users', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token nahi mila!' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Admin only!' });

    const users = await User.find({ role: 'user' })
      .select('name email phone createdAt')
      .sort({ createdAt: -1 });

    res.json({ users, total: users.length });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// GET /api/auth/admin/search-analytics — Top searched keywords
router.get('/admin/search-analytics', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token nahi mila!' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Admin only!' });

    const topSearches = await SearchLog.aggregate([
      { $group: { _id: '$keyword', count: { $sum: 1 }, avgResults: { $avg: '$resultsFound' } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      { $project: { keyword: '$_id', count: 1, avgResults: { $round: ['$avgResults', 0] }, _id: 0 } }
    ]);

    const totalSearches = await SearchLog.countDocuments();
    res.json({ topSearches, totalSearches });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// PUT /api/auth/admin/users/:id/block
router.put('/admin/users/:id/block', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token nahi mila!' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Admin only!' });
    const { isBlocked } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { isBlocked }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User nahi mila!' });
    res.json({ message: isBlocked ? 'User block ho gaya!' : 'User unblock ho gaya!', user });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// DELETE /api/auth/admin/users/:id
router.delete('/admin/users/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token nahi mila!' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Admin only!' });
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User nahi mila!' });
    res.json({ message: 'User delete ho gaya!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Update profile
router.put('/update-profile', protect, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone },
      { new: true }
    ).select('-password');
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;