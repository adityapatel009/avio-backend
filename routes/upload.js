const express = require('express');
const router = express.Router();
const { cloudinary, upload } = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');

// ── POST /api/upload/image ─────────────────────────────────
// Single image upload — admin only
router.post('/image', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Koi image nahi mili!' });
    }
    res.json({
      success: true,
      url: req.file.path,         // Cloudinary URL
      public_id: req.file.filename, // Delete ke liye
    });
  } catch (err) {
    res.status(500).json({ message: 'Image upload failed: ' + err.message });
  }
});

// ── POST /api/upload/images ────────────────────────────────
// Multiple images upload (max 5) — admin only
router.post('/images', protect, adminOnly, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Koi images nahi mili!' });
    }
    const urls = req.files.map(f => ({
      url: f.path,
      public_id: f.filename,
    }));
    res.json({ success: true, images: urls });
  } catch (err) {
    res.status(500).json({ message: 'Images upload failed: ' + err.message });
  }
});

// ── DELETE /api/upload/image ───────────────────────────────
// Delete image from Cloudinary — admin only
router.delete('/image', protect, adminOnly, async (req, res) => {
  try {
    const { public_id } = req.body;
    if (!public_id) return res.status(400).json({ message: 'public_id required hai!' });
    await cloudinary.uploader.destroy(public_id);
    res.json({ success: true, message: 'Image delete ho gayi!' });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed: ' + err.message });
  }
});

module.exports = router;