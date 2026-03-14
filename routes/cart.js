const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const AbandonedCart = require('../models/AbandonedCart');
const User = require('../models/User');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

// ─── ABANDONED CART EMAIL TEMPLATE ───────────────────────
const getCartEmailHTML = (name, items, total, cartUrl, reminderNum) => {
  const subjects = {
    1: `🛒 Aapka cart wait kar raha hai, ${name}!`,
    2: `⏰ Abhi bhi available hai — Aapka cart!`,
    3: `🔥 Last chance! Aapka cart expire hone wala hai`,
  };

  const headlines = {
    1: `Aap kuch bhool gaye! 🛒`,
    2: `Abhi bhi aapka intezaar kar raha hai! ⏰`,
    3: `Last Chance! Sirf thoda sa baaki tha 🔥`,
  };

  const sublines = {
    1: `Aapne kuch amazing items cart mein daale the. Wapas aao aur order complete karo!`,
    2: `Aapke cart ke items abhi available hain. Stock limited hai — jaldi karo!`,
    3: `48 ghante ho gaye — aapka cart ab clear ho jayega. Abhi order karo!`,
  };

  const itemsHTML = items.map(item => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #2a2a3e;">
        <div style="display:flex;align-items:center;gap:12px;">
          <img src="${item.image}" alt="${item.name}"
            style="width:60px;height:60px;object-fit:cover;border-radius:10px;border:1px solid #2a2a3e;" />
          <div>
            <p style="color:#fff;font-size:13px;font-weight:600;margin:0 0 4px;">${item.name}</p>
            ${item.selectedSize ? `<p style="color:#888;font-size:11px;margin:0 0 2px;">Size: ${item.selectedSize}</p>` : ''}
            <p style="color:#888;font-size:11px;margin:0;">Qty: ${item.quantity}</p>
          </div>
          <div style="margin-left:auto;text-align:right;">
            <p style="color:#C084FC;font-weight:bold;font-size:14px;margin:0;">₹${item.price * item.quantity}</p>
            <p style="color:#555;font-size:11px;margin:0;">₹${item.price} each</p>
          </div>
        </div>
      </td>
    </tr>
  `).join('');

  return `
    <body style="margin:0;padding:0;background:#0f0f1a;font-family:Arial,sans-serif;">
      <div style="max-width:580px;margin:40px auto;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:20px;overflow:hidden;">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#6C3AE8,#C084FC);padding:30px;text-align:center;">
          <div style="font-size:18px;font-weight:900;letter-spacing:5px;color:#fff;margin-bottom:8px;">AVIO</div>
          <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;">${headlines[reminderNum]}</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">${sublines[reminderNum]}</p>
        </div>

        <!-- Body -->
        <div style="padding:28px;">
          <p style="color:#aaa;font-size:14px;margin:0 0 20px;">
            Hi <strong style="color:#fff;">${name}</strong>, aapne ye items cart mein daale the:
          </p>

          <!-- Cart Items -->
          <table style="width:100%;border-collapse:collapse;background:#12121E;border-radius:12px;overflow:hidden;margin-bottom:20px;">
            ${itemsHTML}
            <tr>
              <td style="padding:14px 12px;background:#1e1e3a;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="color:#aaa;font-size:14px;font-weight:600;">Total Amount</span>
                  <span style="color:#C084FC;font-size:20px;font-weight:900;">₹${total}</span>
                </div>
              </td>
            </tr>
          </table>

          <!-- COD Badge -->
          <div style="background:#1e3a1e;border:1px solid #2a5a2a;border-radius:10px;padding:12px;margin-bottom:24px;text-align:center;">
            <p style="color:#4ade80;font-size:13px;font-weight:600;margin:0;">
              💵 Cash on Delivery Available • 🚚 Free Delivery above ₹499 • ↩️ 7-Day Returns
            </p>
          </div>

          <!-- CTA Button -->
          <div style="text-align:center;margin-bottom:20px;">
            <a href="${cartUrl}"
              style="display:inline-block;background:linear-gradient(135deg,#6C3AE8,#C084FC);color:#fff;padding:16px 40px;border-radius:14px;font-weight:900;font-size:16px;text-decoration:none;letter-spacing:0.5px;">
              Complete My Order →
            </a>
          </div>

          ${reminderNum === 3 ? `
          <div style="background:#3a1a1a;border:1px solid #5a2a2a;border-radius:10px;padding:12px;text-align:center;margin-bottom:20px;">
            <p style="color:#f87171;font-size:13px;font-weight:600;margin:0;">⚠️ Yeh hamara last reminder hai. Cart 48 ghante baad clear ho jayega.</p>
          </div>
          ` : ''}

          <p style="color:#555;font-size:12px;text-align:center;margin:0;">
            Agar aapne already order kar diya hai toh is email ko ignore karein.
          </p>
        </div>

        <!-- Footer -->
        <div style="background:#12121E;padding:20px;text-align:center;border-top:1px solid #2a2a3e;">
          <p style="color:#C084FC;font-size:13px;font-weight:700;margin:0 0 4px;">AVIO — Everything Love, One Place</p>
          <p style="color:#444;font-size:11px;margin:0;">© 2026 Avio. Made with ❤️ in India</p>
        </div>
      </div>
    </body>
  `;
};

// ─────────────────────────────────────────
// @route   POST /api/cart/save
// @desc    Cart activity save/update karo
// @access  Private (logged in users)
// ─────────────────────────────────────────
router.post('/save', protect, async (req, res) => {
  try {
    const { items, total } = req.body;
    const user = await User.findById(req.user._id).select('name email');
    if (!user) return res.status(404).json({ message: 'User nahi mila' });

    if (!items || items.length === 0) {
      // Cart empty ho gayi — record delete karo
      await AbandonedCart.findOneAndDelete({ user: req.user._id, isRecovered: false });
      return res.json({ message: 'Cart cleared' });
    }

    // Upsert — create ya update
    await AbandonedCart.findOneAndUpdate(
      { user: req.user._id, isRecovered: false },
      {
        user: req.user._id,
        email: user.email,
        name: user.name,
        items,
        total,
        lastUpdated: new Date(),
        // Reset reminders agar cart update hua
        reminder1Sent: false,
        reminder2Sent: false,
        reminder3Sent: false,
      },
      { upsert: true, new: true }
    );

    res.json({ message: 'Cart saved' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────
// @route   POST /api/cart/recovered
// @desc    Order place hua — cart recovered mark karo
// @access  Private
// ─────────────────────────────────────────
router.post('/recovered', protect, async (req, res) => {
  try {
    await AbandonedCart.findOneAndUpdate(
      { user: req.user._id, isRecovered: false },
      { isRecovered: true }
    );
    res.json({ message: 'Cart recovered' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────
// CRON FUNCTION — Abandoned cart emails bhejo
// Server.js se call hoga har ghante
// ─────────────────────────────────────────
const sendAbandonedCartEmails = async () => {
  try {
    const now = new Date();
    const cartUrl = `${process.env.FRONTEND_URL}/cart`;

    // ── Reminder 1: 1 hour baad ──
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const carts1 = await AbandonedCart.find({
      isRecovered: false,
      reminder1Sent: false,
      lastUpdated: { $lte: oneHourAgo },
    });

    for (const cart of carts1) {
      try {
        await transporter.sendMail({
          from: `"Avio ✨" <${process.env.GMAIL_USER}>`,
          to: cart.email,
          subject: `🛒 Aapka cart wait kar raha hai, ${cart.name}!`,
          html: getCartEmailHTML(cart.name, cart.items, cart.total, cartUrl, 1),
        });
        await AbandonedCart.findByIdAndUpdate(cart._id, { reminder1Sent: true });
        console.log(`✅ Reminder 1 sent to ${cart.email}`);
      } catch (err) {
        console.log(`❌ Reminder 1 failed for ${cart.email}:`, err.message);
      }
    }

    // ── Reminder 2: 24 hours baad ──
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
    const carts2 = await AbandonedCart.find({
      isRecovered: false,
      reminder1Sent: true,
      reminder2Sent: false,
      lastUpdated: { $lte: twentyFourHoursAgo },
    });

    for (const cart of carts2) {
      try {
        await transporter.sendMail({
          from: `"Avio ✨" <${process.env.GMAIL_USER}>`,
          to: cart.email,
          subject: `⏰ Abhi bhi available hai — Aapka cart!`,
          html: getCartEmailHTML(cart.name, cart.items, cart.total, cartUrl, 2),
        });
        await AbandonedCart.findByIdAndUpdate(cart._id, { reminder2Sent: true });
        console.log(`✅ Reminder 2 sent to ${cart.email}`);
      } catch (err) {
        console.log(`❌ Reminder 2 failed for ${cart.email}:`, err.message);
      }
    }

    // ── Reminder 3: 48 hours baad ──
    const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000);
    const carts3 = await AbandonedCart.find({
      isRecovered: false,
      reminder2Sent: true,
      reminder3Sent: false,
      lastUpdated: { $lte: fortyEightHoursAgo },
    });

    for (const cart of carts3) {
      try {
        await transporter.sendMail({
          from: `"Avio ✨" <${process.env.GMAIL_USER}>`,
          to: cart.email,
          subject: `🔥 Last chance! Aapka cart expire hone wala hai`,
          html: getCartEmailHTML(cart.name, cart.items, cart.total, cartUrl, 3),
        });
        await AbandonedCart.findByIdAndUpdate(cart._id, { reminder3Sent: true });
        console.log(`✅ Reminder 3 sent to ${cart.email}`);
      } catch (err) {
        console.log(`❌ Reminder 3 failed for ${cart.email}:`, err.message);
      }
    }

    // ── 72hr se purane recovered carts delete karo ──
    const threeDaysAgo = new Date(now - 72 * 60 * 60 * 1000);
    await AbandonedCart.deleteMany({
      $or: [
        { isRecovered: true, updatedAt: { $lte: threeDaysAgo } },
        { reminder3Sent: true, lastUpdated: { $lte: threeDaysAgo } },
      ]
    });

  } catch (error) {
    console.log('Abandoned cart cron error:', error.message);
  }
};

module.exports = router;
module.exports.sendAbandonedCartEmails = sendAbandonedCartEmails;