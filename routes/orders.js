const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const nodemailer = require('nodemailer');
const { protect, adminOnly } = require('../middleware/auth');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

const buildItemsHTML = (items) => items.map(item => `
  <tr>
    <td style="padding:10px;border-bottom:1px solid #2a2a3e;">
      <img src="${item.productImage}" width="50" height="50" style="border-radius:8px;object-fit:cover;vertical-align:middle;margin-right:10px;" />
      <span style="color:#fff;font-size:13px;">${item.productName}</span>
    </td>
    <td style="padding:10px;border-bottom:1px solid #2a2a3e;text-align:center;color:#aaa;font-size:13px;">x${item.quantity}</td>
    <td style="padding:10px;border-bottom:1px solid #2a2a3e;text-align:right;color:#C084FC;font-weight:bold;font-size:13px;">₹${item.price * item.quantity}</td>
  </tr>
`).join('');

// ─── ORDER CONFIRMATION EMAIL ─────────────────────────────
const sendOrderConfirmationEmail = async (customerEmail, customerName, order) => {
  try {
    await transporter.sendMail({
      from: `"Avio ✨" <${process.env.GMAIL_USER}>`,
      to: customerEmail,
      subject: `✨ Order Confirmed! #${order.orderId} — Avio`,
      html: `
        <!DOCTYPE html><html><head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;background:#0f0f1a;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:40px auto;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:16px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#6C3AE8,#C084FC);padding:28px;text-align:center;">
              <div style="font-size:16px;font-weight:900;letter-spacing:4px;color:#fff;margin-bottom:4px;">AVIO</div>
              <div style="height:2px;width:40px;background:#fff;border-radius:2px;margin:0 auto 12px;"></div>
              <h1 style="color:#fff;margin:0;font-size:22px;font-weight:bold;">Order Confirmed! 🎉</h1>
              <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">Everything Love, One Place</p>
            </div>
            <div style="padding:28px;">
              <p style="color:#aaa;font-size:14px;margin:0 0 20px;">
                Hi <strong style="color:#fff;">${customerName}</strong>, your order has been placed successfully!
              </p>
              <div style="background:#12121E;border:1px solid #6C3AE8;border-radius:12px;padding:16px;text-align:center;margin-bottom:24px;">
                <p style="color:#aaa;font-size:12px;margin:0 0 4px;">Order ID</p>
                <p style="color:#C084FC;font-size:22px;font-weight:bold;margin:0;letter-spacing:2px;">${order.orderId}</p>
              </div>
              <p style="color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;">Your Items</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#12121E;border-radius:10px;overflow:hidden;">
                ${buildItemsHTML(order.items)}
              </table>
              <div style="background:#12121E;border-radius:10px;padding:16px;margin-top:16px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                  <span style="color:#aaa;font-size:13px;">Subtotal</span>
                  <span style="color:#fff;font-size:13px;">₹${order.totalAmount}</span>
                </div>
                ${order.discount > 0 ? `
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                  <span style="color:#aaa;font-size:13px;">Discount</span>
                  <span style="color:#4ade80;font-size:13px;">− ₹${order.discount}</span>
                </div>` : ''}
                <div style="display:flex;justify-content:space-between;border-top:1px solid #2a2a3e;padding-top:10px;margin-top:4px;">
                  <span style="color:#fff;font-size:14px;font-weight:bold;">Total (COD)</span>
                  <span style="color:#C084FC;font-size:16px;font-weight:bold;">₹${order.finalAmount}</span>
                </div>
              </div>
              <div style="background:#12121E;border-radius:10px;padding:16px;margin-top:16px;">
                <p style="color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Delivery Address</p>
                <p style="color:#fff;font-size:13px;margin:0;">${order.deliveryAddress?.fullName}</p>
                <p style="color:#aaa;font-size:12px;margin:4px 0 0;">${order.deliveryAddress?.addressLine}, ${order.deliveryAddress?.city}, ${order.deliveryAddress?.state} — ${order.deliveryAddress?.pincode}</p>
                <p style="color:#aaa;font-size:12px;margin:4px 0 0;">📞 ${order.deliveryAddress?.phone}</p>
              </div>
              <p style="color:#666;font-size:12px;text-align:center;margin:24px 0 0;">
                Payment Method: <strong style="color:#C084FC;">Cash on Delivery</strong>
              </p>
            </div>
            <div style="background:#12121E;padding:20px;text-align:center;border-top:1px solid #2a2a3e;">
              <p style="color:#555;font-size:12px;margin:0;">© 2026 Avio. Made with ❤️ in India</p>
            </div>
          </div>
        </body></html>
      `,
    });
  } catch (err) { console.log('Order confirmation email error:', err.message); }
};

// ─── STATUS UPDATE EMAIL ──────────────────────────────────
const sendStatusUpdateEmail = async (customerEmail, customerName, order, note) => {
  const statusConfig = {
    Confirmed:  { emoji: '✅', color: '#60A5FA', msg: 'Your order has been confirmed and will be processed shortly.' },
    Processing: { emoji: '⚙️', color: '#A78BFA', msg: 'Your order is being processed and packed.' },
    Shipped:    { emoji: '🚚', color: '#22D3EE', msg: 'Your order is on the way! Get ready to receive it.' },
    Delivered:  { emoji: '🎉', color: '#4ADE80', msg: 'Your order has been delivered. Hope you love your purchase!' },
    Cancelled:  { emoji: '❌', color: '#F87171', msg: 'Your order has been cancelled.' },
  };
  const cfg = statusConfig[order.status];
  if (!cfg) return;
  try {
    await transporter.sendMail({
      from: `"Avio ✨" <${process.env.GMAIL_USER}>`,
      to: customerEmail,
      subject: `${cfg.emoji} Order ${order.status} — #${order.orderId} | Avio`,
      html: `
        <!DOCTYPE html><html><head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;background:#0f0f1a;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:40px auto;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:16px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#1a1a2e,#12121E);padding:28px;text-align:center;border-bottom:2px solid ${cfg.color};">
              <div style="font-size:14px;font-weight:900;letter-spacing:4px;color:#C084FC;margin-bottom:8px;">AVIO</div>
              <div style="font-size:40px;margin-bottom:8px;">${cfg.emoji}</div>
              <h1 style="color:${cfg.color};margin:0;font-size:22px;">Order ${order.status}!</h1>
              <p style="color:#888;margin:6px 0 0;font-size:13px;">Order #${order.orderId}</p>
            </div>
            <div style="padding:28px;">
              <p style="color:#aaa;font-size:14px;margin:0 0 16px;">
                Hi <strong style="color:#fff;">${customerName}</strong>, ${cfg.msg}
              </p>
              ${note ? `
              <div style="background:#12121E;border-left:3px solid ${cfg.color};border-radius:8px;padding:14px;margin-bottom:20px;">
                <p style="color:#aaa;font-size:12px;text-transform:uppercase;margin:0 0 4px;">Note from Avio</p>
                <p style="color:#fff;font-size:13px;margin:0;">${note}</p>
              </div>` : ''}
              <div style="background:#12121E;border-radius:10px;padding:16px;margin-bottom:16px;">
                <p style="color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Order Summary</p>
                ${order.items.map(item => `
                  <div style="display:flex;align-items:center;margin-bottom:10px;">
                    <img src="${item.productImage}" width="40" height="40" style="border-radius:6px;object-fit:cover;margin-right:10px;" />
                    <div style="flex:1;">
                      <p style="color:#fff;font-size:12px;margin:0;">${item.productName}</p>
                      <p style="color:#aaa;font-size:11px;margin:2px 0 0;">Qty: ${item.quantity} × ₹${item.price}</p>
                    </div>
                  </div>
                `).join('')}
                <div style="border-top:1px solid #2a2a3e;padding-top:10px;margin-top:6px;text-align:right;">
                  <span style="color:#C084FC;font-weight:bold;font-size:15px;">Total: ₹${order.finalAmount}</span>
                </div>
              </div>
              ${order.status === 'Delivered' ? `
              <div style="text-align:center;margin-top:20px;">
                <a href="${process.env.FRONTEND_URL}/orders" style="display:inline-block;background:linear-gradient(135deg,#6C3AE8,#C084FC);color:#fff;padding:12px 28px;border-radius:10px;font-weight:bold;font-size:13px;text-decoration:none;">
                  View My Orders
                </a>
              </div>` : ''}
            </div>
            <div style="background:#12121E;padding:20px;text-align:center;border-top:1px solid #2a2a3e;">
              <p style="color:#555;font-size:12px;margin:0;">© 2026 Avio. Made with ❤️ in India</p>
            </div>
          </div>
        </body></html>
      `,
    });
  } catch (err) { console.log('Status update email error:', err.message); }
};

// ════════════════════════════════════════════════════════════
// ROUTES (same as before — only branding changed)
// ════════════════════════════════════════════════════════════

router.post('/', protect, async (req, res) => {
  try {
    const { items, deliveryAddress, couponCode } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ message: 'Cart empty hai' });
    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId || item.product);
      if (!product) return res.status(404).json({ message: `Product nahi mila` });
      if (product.stock < item.quantity) return res.status(400).json({ message: `${product.name} ka stock kam hai` });
      const price = product.sellingPrice;
      totalAmount += price * item.quantity;
      orderItems.push({ product: product._id, productName: product.name, productImage: product.images[0] || '', quantity: item.quantity, price });
      await Product.findByIdAndUpdate(product._id, { $inc: { stock: -item.quantity, purchaseCount: item.quantity } });
    }
    let discount = 0, couponUsed = null;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true, expiryDate: { $gt: new Date() } });
      if (coupon && totalAmount >= coupon.minOrderValue) {
        if (coupon.discountType === 'percentage') {
          discount = (totalAmount * coupon.discountValue) / 100;
          if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
        } else { discount = coupon.discountValue; }
        couponUsed = couponCode.toUpperCase();
      }
    }
    const finalAmount = totalAmount - discount;
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    const orderId = `AV-${year}-${random}`;
    const order = new Order({
      orderId, customer: req.user._id, deliveryAddress, items: orderItems,
      totalAmount, discount, finalAmount, couponUsed, paymentMethod: 'COD', status: 'Pending',
      statusHistory: [{ status: 'Pending', note: 'Order place kiya gaya', updatedAt: new Date() }]
    });
    await order.save();
    sendOrderConfirmationEmail(req.user.email, req.user.name, order);
    res.status(201).json({ message: '🎉 Order place ho gaya!', orderId: order.orderId, finalAmount: order.finalAmount, order });
  } catch (error) {
    console.log('ORDER ERROR:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/mine', protect, async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user._id }).sort({ createdAt: -1 });
    res.json({ orders });
  } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
});

router.get('/track/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ message: 'Order nahi mila' });
    res.json({ order });
  } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
});

router.get('/', adminOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let filter = {};
    if (status) filter.status = status;
    const skip = (page - 1) * limit;
    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter).populate('customer', 'name email phone').sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    res.json({ orders, currentPage: Number(page), totalPages: Math.ceil(total / limit), totalOrders: total });
  } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
});

router.put('/:id/status', adminOnly, async (req, res) => {
  try {
    const { status, note, expectedDelivery, meeshoOrderId } = req.body;
    const order = await Order.findById(req.params.id).populate('customer', 'name email');
    if (!order) return res.status(404).json({ message: 'Order nahi mila' });
    order.status = status;
    order.statusHistory.push({ status, note: note || '', updatedAt: new Date() });
    if (expectedDelivery) order.expectedDelivery = expectedDelivery;
    if (meeshoOrderId) order.meeshoOrderId = meeshoOrderId;
    await order.save();
    if (order.customer?.email) sendStatusUpdateEmail(order.customer.email, order.customer.name, order, note);
    res.json({ message: `Order ${status} ho gaya!`, order });
  } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
});

router.get('/admin/low-stock', adminOnly, async (req, res) => {
  try {
    const threshold = Number(req.query.threshold) || 5;
    const products = await Product.find({ stock: { $lte: threshold } }).select('name stock images category sellingPrice').sort({ stock: 1 });
    res.json({ products, total: products.length });
  } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
});

router.put('/:id/cancel', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order nahi mila!' });
    if (order.customer.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Unauthorized!' });
    if (!['Pending', 'Confirmed'].includes(order.status)) return res.status(400).json({ message: `${order.status} order cancel nahi ho sakta!` });
    order.status = 'Cancelled';
    order.statusHistory.push({ status: 'Cancelled', note: 'Customer ne cancel kiya', updatedAt: new Date() });
    await order.save();
    if (req.user.email) sendStatusUpdateEmail(req.user.email, req.user.name, order, 'Aapne khud cancel kiya.');
    res.json({ message: 'Order cancel ho gaya!', order });
  } catch (err) { res.status(500).json({ message: 'Server error!', error: err.message }); }
});

// Admin - Delete Order
router.delete('/admin/:id', adminOnly, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) 
      return res.status(404).json({ message: 'Order nahi mila!' });
    
    res.json({ message: 'Order delete ho gaya!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════
// RETURN REQUEST ROUTES — paste before module.exports
// ══════════════════════════════════════════════════

// User — Return request submit karo
router.post('/:id/return', protect, async (req, res) => {
  try {
    const { reason, description, images } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order nahi mila!' });
    if (order.customer.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Unauthorized!' });
    if (order.status !== 'Delivered')
      return res.status(400).json({ message: 'Sirf delivered orders return ho sakte hain!' });
    if (order.returnRequest?.status && order.returnRequest.status !== 'None')
      return res.status(400).json({ message: 'Return request already submit ho chuki hai!' });

    order.returnRequest = {
      status: 'Pending',
      reason,
      description: description || '',
      images: images || [],
      requestedAt: new Date(),
      adminNote: null,
      resolvedAt: null,
    };

    order.statusHistory.push({
      status: 'Returned',
      note: `Return request: ${reason}`,
      updatedAt: new Date()
    });

    await order.save();
    res.json({ message: 'Return request submit ho gayi! Admin review karega.', order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin — Return requests list dekho
router.get('/admin/returns', adminOnly, async (req, res) => {
  try {
    const orders = await Order.find({ 'returnRequest.status': { $in: ['Pending', 'Accepted', 'Rejected'] } })
      .populate('customer', 'name email phone')
      .sort({ 'returnRequest.requestedAt': -1 });
    res.json({ orders, total: orders.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin — Return request accept/reject karo
router.put('/:id/return/resolve', adminOnly, async (req, res) => {
  try {
    const { status, adminNote } = req.body; // status: 'Accepted' or 'Rejected'
    if (!['Accepted', 'Rejected'].includes(status))
      return res.status(400).json({ message: 'Status Accepted ya Rejected hona chahiye!' });

    const order = await Order.findById(req.params.id).populate('customer', 'name email');
    if (!order) return res.status(404).json({ message: 'Order nahi mila!' });

    order.returnRequest.status = status;
    order.returnRequest.adminNote = adminNote || '';
    order.returnRequest.resolvedAt = new Date();

    if (status === 'Accepted') {
      order.status = 'Returned';
      order.statusHistory.push({
        status: 'Returned',
        note: adminNote || 'Return request accept ho gayi',
        updatedAt: new Date()
      });
    } else {
      order.statusHistory.push({
        status: order.status,
        note: `Return request reject: ${adminNote || 'Admin ne reject kiya'}`,
        updatedAt: new Date()
      });
    }

    await order.save();

    // Email bhejo customer ko
    if (order.customer?.email) {
      const emailStatus = status === 'Accepted' ? '✅ Return Accepted' : '❌ Return Rejected';
      sendStatusUpdateEmail(
        order.customer.email,
        order.customer.name,
        order,
        adminNote || (status === 'Accepted' ? 'Aapki return request accept ho gayi!' : 'Aapki return request reject ho gayi.')
      );
    }

    res.json({ message: `Return ${status}!`, order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;