import rateLimit from 'express-rate-limit';

// ── Auth limiter: 20 requests per 15 minutes ──
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
});

// ── Inference limiter: 10 requests per 1 minute ──
export const inferenceLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many inference requests. Try again in 1 minute.' },
});

// ── Concierge limiter: 30 requests per 1 minute ──
export const conciergeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many concierge requests. Try again in 1 minute.' },
});

// ── Server exec limiter: 10 requests per minute per server ──
export const serverExecLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many exec requests for this server. Try again in 1 minute.' },
});

// ── Global limiter: 100 requests per 1 minute ──
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in 1 minute.' },
});
