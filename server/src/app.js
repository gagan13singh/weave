require('dotenv').config();
const express = require('express');
const { configureHelmet, configureCors } = require('./middleware/security');
const { apiLimiter } = require('./middleware/rateLimiter');
const authRoutes = require('./routes/auth');
const vaultRoutes = require('./routes/vault');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── SECURITY MIDDLEWARE ─────────────────────────────────
app.use(configureHelmet());
app.use(configureCors());

// ─── BODY PARSING ────────────────────────────────────────
app.use(express.json({ limit: '1mb' })); // Limit payload size
app.use(express.urlencoded({ extended: false }));

// ─── GLOBAL RATE LIMIT ──────────────────────────────────
app.use('/api', apiLimiter);

// ─── ROUTES ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/vault', vaultRoutes);

// ─── HEALTH CHECK ────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── 404 HANDLER ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── ERROR HANDLER ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ─── START SERVER ────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🔐 Weave API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
