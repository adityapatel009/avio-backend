const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).json({ message: 'Token nahi mila' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Admin special case
    if (decoded.id === 'admin') {
      req.user = { _id: 'admin', name: 'Admin', email: process.env.ADMIN_EMAIL, role: 'admin' };
      return next();
    }

    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: 'User nahi mila' });
    req.user = user;
    next();
  } catch (error) {
    console.log('Auth error:', error.message);
    return res.status(401).json({ message: 'Token invalid hai — dobara login karo', error: error.message });
  }
};

const adminOnly = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).json({ message: 'Token nahi mila' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Admin special case — 'admin' string ObjectId nahi hai, DB query mat karo
    if (decoded.id === 'admin' && decoded.role === 'admin') {
      req.user = { _id: 'admin', name: 'Admin', email: process.env.ADMIN_EMAIL, role: 'admin' };
      return next();
    }

    const user = await User.findById(decoded.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied — sirf admin ke liye hai' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.log('Admin auth error:', error.message);
    return res.status(401).json({ message: 'Token invalid hai', error: error.message });
  }
};

module.exports = { protect, adminOnly };