
const express = require('express');
const router = express.Router();
const FlashSale = require('../models/FlashSale');
const jwt = require('jsonwebtoken');

// Admin check middleware
const isAdmin = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token nahi mila!' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Admin only!' });
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token!' });
  }
};

// GET /api/flashsale — Public (anyone can see active sale)
router.get('/', async (req, res) => {
  try {
    const sale = await FlashSale.findOne({ isActive: true }).sort({ createdAt: -1 });
    res.json({ sale: sale || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/flashsale — Admin: create/update sale
router.post('/', isAdmin, async (req, res) => {
  try {
    const { title, discount, code, endTime, isActive, message } = req.body;
    // Purani sab inactive kar do
    await FlashSale.updateMany({}, { isActive: false });
    const sale = await FlashSale.create({ title, discount, code, endTime, isActive: true, message });
    res.status(201).json({ message: 'Flash sale create ho gaya!', sale });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/flashsale/:id — Admin: update
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const sale = await FlashSale.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ message: 'Flash sale update ho gaya!', sale });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/flashsale/:id — Admin: delete / turn off
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    await FlashSale.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Flash sale band ho gaya!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
