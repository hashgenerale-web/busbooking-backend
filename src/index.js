require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRouter = require('./routes/auth');
const bookingRouter = require('./routes/booking');
const adminRouter = require('./routes/admin');
const { startScheduler } = require('./services/scheduler');

const app = express();

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://hop-on.vercel.app',
  credentials: true,
}));
app.use(express.json());

// Rate limiter — prevents hammering even before auth
const limiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 60,                  // 60 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

// Strict limiter on login to prevent brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts, please wait.' },
});

app.use('/api', limiter);
app.use('/api/auth/login', loginLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/booking', bookingRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function start() {
  // Fail fast and loud if Supabase env vars are missing/wrong, rather than
  // letting every request 500 with a confusing error later.
  try {
    const { staffRepo } = require('./db');
    await staffRepo.findAll();
    console.log('[Server] Supabase connection verified');
  } catch (err) {
    console.error('[Server] FATAL: could not connect to Supabase.');
    console.error('  Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    console.error('  ', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
    startScheduler();
  });
}

start();
