const jwt = require('jsonwebtoken');

/**
 * JWT Authentication Middleware
 * 
 * Verifies the access token from the Authorization header.
 * Access tokens are short-lived (15 min) to limit exposure if compromised.
 * If expired, the client should use the refresh token to get a new pair.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

module.exports = { authenticate };
