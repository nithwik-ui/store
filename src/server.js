const fs = require('fs');
const path = require('path');

// Manually load .env variables if present
const dotenvPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(dotenvPath)) {
  const dotenvContent = fs.readFileSync(dotenvPath, 'utf8');
  dotenvContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      if (key) {
        process.env[key] = value;
      }
    }
  });
}

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'magmazoes-premium-streetwear-secret-key-2026';

// Initialize Database
db.initDb().catch(err => {
  console.error('Failed to initialize database:', err);
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files (we will serve images, js, css from /public)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health endpoint for deployment checks
app.get('/api/health', (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'development' });
});

// Initialize Supabase Clients
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
let supabaseAdmin = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('Supabase Public Client initialized.');
}
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  console.log('Supabase Admin Client initialized.');
}
if (supabase && !supabaseAdmin) {
  supabaseAdmin = supabase; // fallback
}

// Global HTTPS Enforcement in Production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const proto = req.headers['x-forwarded-proto'];
    if (proto && proto !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Global Security Headers
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none';");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// CSRF Protection Middleware
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const host = req.headers.host;
  
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return res.status(403).json({ error: 'CSRF verification failed. Origin mismatch.' });
      }
    } catch(e) {
      return res.status(400).json({ error: 'Invalid Origin header.' });
    }
  } else if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (refererHost !== host) {
        return res.status(403).json({ error: 'CSRF verification failed. Referer mismatch.' });
      }
    } catch(e) {
      return res.status(400).json({ error: 'Invalid Referer header.' });
    }
  }
  next();
});

// Input Sanitization Helpers
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = Array.isArray(obj) ? [] : {};
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      result[key] = sanitizeString(obj[key]);
    } else if (typeof obj[key] === 'object') {
      result[key] = sanitizeObject(obj[key]);
    } else {
      result[key] = obj[key];
    }
  }
  return result;
}

// Global Sanitization Middleware
app.use((req, res, next) => {
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  next();
});

// Rate Limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many administrator attempts. Please try again later.' }
});

// JWT / Supabase Auth Authentication Middleware
async function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    req.user = null;
    return next();
  }

  // If Supabase client exists, verify the token against Supabase Auth
  if (supabase && db.isPostgres) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        req.user = null;
        res.clearCookie('token');
        return next();
      }
      
      const profile = await db.get('SELECT username, role FROM users WHERE id = ?', [user.id]);
      req.user = {
        id: user.id,
        email: user.email,
        username: profile ? profile.username : user.email.split('@')[0],
        role: profile ? profile.role : 'customer'
      };
    } catch (err) {
      req.user = null;
    }
    return next();
  } else {
    // SQLite local development fallback
    try {
      const decodedUser = jwt.verify(token, JWT_SECRET);
      const user = await db.get('SELECT id, username, email, role FROM users WHERE id = ?', [decodedUser.id]);
      if (!user) {
        req.user = null;
        res.clearCookie('token');
      } else {
        req.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        };
        
        // If the role has changed, refresh the token cookie
        if (user.role !== decodedUser.role) {
          const sessionToken = jwt.sign(req.user, JWT_SECRET, { expiresIn: '7d' });
          res.cookie('token', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
          });
        }
      }
    } catch (err) {
      req.user = null;
      res.clearCookie('token');
    }
    return next();
  }
}

function requireAuth(req, res, next) {
  authenticateToken(req, res, () => {
    if (!req.user) {
      if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required. Please login.' });
      }
      return res.redirect('/login');
    }
    next();
  });
}

function requireStaff(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'staff' && req.user.role !== 'admin' && req.user.role !== 'owner') {
      if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Access denied. Staff privileges required.' });
      }
      return res.redirect('/');
    }
    next();
  });
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && req.user.role !== 'owner') {
      if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
      }
      return res.redirect('/');
    }
    next();
  });
}

function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'owner') {
      if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Access denied. Owner privileges required.' });
      }
      return res.redirect('/');
    }
    next();
  });
}

// 15-minute password confirmation window for sensitive admin actions
function requireSudo(req, res, next) {
  const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1' || req.hostname === 'localhost';
  const isLocalAdmin = isLocal && req.user && req.user.username === 'admin';
  if (isLocalAdmin) {
    return next();
  }

  const sudoToken = req.cookies.sudo_token;
  if (!sudoToken) {
    return res.status(403).json({ error: 'sudo_required', message: 'Sudo verification required.' });
  }

  jwt.verify(sudoToken, JWT_SECRET, (err, decoded) => {
    if (err || decoded.id !== req.user.id) {
      res.clearCookie('sudo_token');
      return res.status(403).json({ error: 'sudo_required', message: 'Sudo session expired or invalid.' });
    }
    next();
  });
}

// Optional Auth for public endpoints (adds user info if logged in)
app.use(authenticateToken);

// Helper: enrich product with images and size inventory
async function enrichProduct(p) {
  if (!p) return p;
  try { p.sizes = JSON.parse(p.sizes || '[]'); } catch(e) { p.sizes = []; }
  try { p.colors = JSON.parse(p.colors || '[]'); } catch(e) { p.colors = []; }

  // Fetch size_inventory
  try {
    const sizeInventory = await db.all(
      'SELECT size, stock FROM product_size_inventory WHERE product_id = ? ORDER BY CAST(size AS REAL)',
      [p.id]
    );
    p.size_inventory = sizeInventory;
  } catch(e) {
    p.size_inventory = [];
  }

  // Primary image
  try {
    const images = await db.all(
      'SELECT id, url, sort_order, is_primary FROM product_images WHERE product_id = ? ORDER BY sort_order, id',
      [p.id]
    );
    p.images = images;
    
    const primaryImg = images.find(img => img.is_primary === 1) || images[0];
    if (primaryImg) p.image_url = primaryImg.url;
  } catch(e) {
    p.images = [];
  }

  return p;
}

// Helper: enrich products in batch (to prevent N+1 queries)
async function enrichProducts(products) {
  if (!products || products.length === 0) return products;
  
  const productIds = products.map(p => p.id);
  
  // Initialize sizes and colors parsed arrays
  for (const p of products) {
    try { p.sizes = JSON.parse(p.sizes || '[]'); } catch(e) { p.sizes = []; }
    try { p.colors = JSON.parse(p.colors || '[]'); } catch(e) { p.colors = []; }
    p.size_inventory = [];
    p.images = [];
  }
  
  const placeholders = productIds.map(() => '?').join(', ');
  
  // Fetch sizes
  try {
    const sizeInventories = await db.all(
      `SELECT product_id, size, stock FROM product_size_inventory WHERE product_id IN (${placeholders}) ORDER BY CAST(size AS REAL)`,
      productIds
    );
    const sizesMap = {};
    for (const item of sizeInventories) {
      if (!sizesMap[item.product_id]) {
        sizesMap[item.product_id] = [];
      }
      sizesMap[item.product_id].push({ size: item.size, stock: item.stock });
    }
    for (const p of products) {
      if (sizesMap[p.id]) {
        p.size_inventory = sizesMap[p.id];
      }
    }
  } catch(e) {
    console.error('Error batch fetching size inventory:', e);
  }
  
  // Fetch images
  try {
    const allImages = await db.all(
      `SELECT id, product_id, url, sort_order, is_primary FROM product_images WHERE product_id IN (${placeholders}) ORDER BY sort_order, id`,
      productIds
    );
    const imagesMap = {};
    for (const img of allImages) {
      if (!imagesMap[img.product_id]) {
        imagesMap[img.product_id] = [];
      }
      imagesMap[img.product_id].push(img);
    }
    for (const p of products) {
      if (imagesMap[p.id]) {
        p.images = imagesMap[p.id];
        const primaryImg = p.images.find(img => img.is_primary === 1 || img.is_primary === true) || p.images[0];
        if (primaryImg) {
          p.image_url = primaryImg.url;
        }
      }
    }
  } catch(e) {
    console.error('Error batch fetching product images:', e);
  }
  
  return products;
}

// Caching layer
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

function getCachedResponse(req, res, next) {
  const key = req.originalUrl;
  const cached = cache.get(key);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[CACHE HIT] ${key}`);
    return res.json(cached.data);
  }
  
  console.log(`[CACHE MISS] ${key}`);
  const originalJson = res.json;
  res.json = function(body) {
    if (res.statusCode === 200) {
      cache.set(key, {
        data: body,
        timestamp: Date.now()
      });
    }
    return originalJson.call(this, body);
  };
  next();
}

function clearCache() {
  cache.clear();
  console.log('[CACHE CLEAR] Server-side memory cache cleared.');
}


// Audit logging helper
async function logAuditAction(userId, action, details) {
  try {
    await db.run(
      'INSERT INTO public.audit_logs (user_id, action, details) VALUES (?, ?, ?)',
      [userId, action, details]
    );
  } catch (err) {
    console.error('Failed to log audit action:', err);
  }
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Authentication Endpoints
app.post('/api/signup', authLimiter, async (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }

  // Regex validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Username must be at least 3 characters and contain only letters, numbers, and underscores.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    // Check if user exists in public table
    const existingUser = await db.get('SELECT id FROM public.users WHERE username = ? OR email = ?', [username, email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Username or Email is already registered.' });
    }

    let userId;
    let sessionToken;
    let newUserProfile;

    if (supabase && db.isPostgres) {
      // Sign up with Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username }
        }
      });
      if (error) {
        return res.status(400).json({ error: error.message });
      }

      userId = data.user.id;
      sessionToken = data.session ? data.session.access_token : null;

      if (!sessionToken) {
        // Log in right away to get session token if auto-sign in didn't provide session
        const { data: logData, error: logErr } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (!logErr && logData.session) {
          sessionToken = logData.session.access_token;
        }
      }

      // Add profile to users table
      await db.run(
        'INSERT INTO public.users (id, username, email, role) VALUES (?, ?, ?, ?)',
        [userId, username, email, 'customer']
      );

      newUserProfile = {
        id: userId,
        username,
        email,
        role: 'customer'
      };
    } else {
      // Local development SQLite fallback
      const passwordHash = bcrypt.hashSync(password, 10);
      await db.run(
        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [username, email, passwordHash, 'customer']
      );
      
      const createdUser = await db.get('SELECT id, username, email, role FROM users WHERE username = ?', [username]);
      userId = createdUser.id;
      newUserProfile = createdUser;
      sessionToken = jwt.sign(createdUser, JWT_SECRET, { expiresIn: '7d' });
    }

    if (sessionToken) {
      res.cookie('token', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    }

    res.json({ success: true, user: newUserProfile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during signup.' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Email/Username and Password are required.' });
  }

  try {
    const user = await db.get('SELECT * FROM public.users WHERE username = ? OR email = ?', [username, username]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid username/email or password.' });
    }

    let sessionToken;
    const sessionUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    if (supabase && db.isPostgres) {
      // Sign in with Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password
      });
      if (error) {
        return res.status(400).json({ error: 'Invalid username/email or password.' });
      }
      sessionToken = data.session.access_token;
    } else {
      // Local development SQLite fallback
      const passwordMatch = bcrypt.compareSync(password, user.password_hash);
      if (!passwordMatch) {
        return res.status(400).json({ error: 'Invalid username/email or password.' });
      }
      sessionToken = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: '7d' });
    }

    res.cookie('token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true, user: sessionUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

app.post('/api/logout', async (req, res) => {
  if (supabase && req.cookies.token) {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
  }
  res.clearCookie('token');
  res.clearCookie('sudo_token');
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  if (!req.user) {
    return res.json({ loggedIn: false });
  }
  res.json({ loggedIn: true, user: req.user });
});

// Sudo Verification Endpoint for Sensitive Admin Actions
app.post('/api/admin/sudo', requireAuth, async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  try {
    let isVerified = false;
    if (supabase && db.isPostgres) {
      const { error } = await supabase.auth.signInWithPassword({
        email: req.user.email,
        password
      });
      isVerified = !error;
    } else {
      const user = await db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
      if (user) {
        isVerified = bcrypt.compareSync(password, user.password_hash);
      }
    }

    if (!isVerified) {
      return res.status(400).json({ error: 'Incorrect password.' });
    }

    // Generate short-lived sudo token (valid for 15 minutes)
    const sudoToken = jwt.sign({ id: req.user.id }, JWT_SECRET, { expiresIn: '15m' });
    res.cookie('sudo_token', sudoToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during verification.' });
  }
});

// 2. Settings Endpoints
app.get('/api/settings', getCachedResponse, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM settings');
    const settingsObj = {};
    rows.forEach(r => {
      settingsObj[r.key] = r.value;
    });
    res.json(settingsObj);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings.' });
  }
});

app.post('/api/settings', requireAdmin, requireSudo, async (req, res) => {
  const settings = req.body;
  try {
    for (const key of Object.keys(settings)) {
      await db.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, String(settings[key])],
        req.user
      );
    }
    await logAuditAction(req.user.id, 'UPDATE_SETTINGS', `Updated settings: ${Object.keys(settings).join(', ')}`);
    clearCache();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

// 3. Store Sections Endpoints (public)
app.get('/api/sections', getCachedResponse, async (req, res) => {
  try {
    const sections = await db.all('SELECT * FROM public.store_sections ORDER BY id');
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch store sections.' });
  }
});

// 4. Products Endpoints
app.get('/api/products/homepage', getCachedResponse, async (req, res) => {
  try {
    const featuredQuery = `SELECT p.*, c.name as category_name, s.name as section_name, s.slug as section_slug
       FROM public.products p
       LEFT JOIN public.categories c ON p.category_id = c.id
       LEFT JOIN public.store_sections s ON p.section_id = s.id
       WHERE p.enabled = 1 AND p.is_featured = 1
       ORDER BY p.created_at DESC LIMIT 3`;

    const newArrivalsQuery = `SELECT p.*, c.name as category_name, s.name as section_name, s.slug as section_slug
       FROM public.products p
       LEFT JOIN public.categories c ON p.category_id = c.id
       LEFT JOIN public.store_sections s ON p.section_id = s.id
       WHERE p.enabled = 1 AND p.is_new_arrival = 1
       ORDER BY p.created_at DESC LIMIT 6`;

    const limitedEditionQuery = `SELECT p.*, c.name as category_name, s.name as section_name, s.slug as section_slug
       FROM public.products p
       LEFT JOIN public.categories c ON p.category_id = c.id
       LEFT JOIN public.store_sections s ON p.section_id = s.id
       WHERE p.enabled = 1 AND p.is_limited_edition = 1
       ORDER BY p.created_at DESC LIMIT 4`;

    const latestDropsQuery = `SELECT p.*, c.name as category_name, s.name as section_name, s.slug as section_slug
       FROM public.products p
       LEFT JOIN public.categories c ON p.category_id = c.id
       LEFT JOIN public.store_sections s ON p.section_id = s.id
       WHERE p.enabled = 1
       ORDER BY p.created_at DESC LIMIT 4`;

    const [featuredRaw, newArrivalsRaw, limitedEditionRaw, latestDropsRaw] = await Promise.all([
      db.all(featuredQuery),
      db.all(newArrivalsQuery),
      db.all(limitedEditionQuery),
      db.all(latestDropsQuery)
    ]);

    // Combine all to enrich in a single batch
    const allProducts = [...featuredRaw, ...newArrivalsRaw, ...limitedEditionRaw, ...latestDropsRaw];
    
    // De-duplicate product ids just in case same product appears in multiple lists
    const uniqueProductsMap = new Map();
    allProducts.forEach(p => {
      if (!uniqueProductsMap.has(p.id)) {
        uniqueProductsMap.set(p.id, { ...p });
      }
    });
    
    const uniqueProducts = Array.from(uniqueProductsMap.values());
    await enrichProducts(uniqueProducts);
    
    // Map enriched data back to original arrays
    const enrichedMap = new Map(uniqueProducts.map(p => [p.id, p]));
    
    const featured = featuredRaw.map(p => enrichedMap.get(p.id));
    const new_arrivals = newArrivalsRaw.map(p => enrichedMap.get(p.id));
    const limited_edition = limitedEditionRaw.map(p => enrichedMap.get(p.id));
    const latest_drops = latestDropsRaw.map(p => enrichedMap.get(p.id));

    res.json({ featured, new_arrivals, limited_edition, latest_drops });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch homepage products.' });
  }
});


app.get('/api/products', getCachedResponse, async (req, res) => {
  const { category, section, brand, is_featured, is_new_arrival, is_limited_edition, is_resale, sort, search, page = 1, limit = 12 } = req.query;
  
  let query = `SELECT p.*, c.name as category_name, s.name as section_name, s.slug as section_slug
               FROM public.products p
               LEFT JOIN public.categories c ON p.category_id = c.id
               LEFT JOIN public.store_sections s ON p.section_id = s.id
               WHERE p.enabled = 1`;
  const params = [];

  if (category) {
    query += ' AND c.slug = ?';
    params.push(category);
  }
  if (section) {
    query += ' AND s.slug = ?';
    params.push(section);
  }
  if (brand) {
    query += ' AND p.brand ILIKE ?';
    params.push(`%${brand}%`);
  }
  if (is_featured !== undefined) {
    query += ' AND p.is_featured = ?';
    params.push(is_featured === 'true' || is_featured === '1' ? 1 : 0);
  }
  if (is_new_arrival !== undefined) {
    query += ' AND p.is_new_arrival = ?';
    params.push(is_new_arrival === 'true' || is_new_arrival === '1' ? 1 : 0);
  }
  if (is_limited_edition !== undefined) {
    query += ' AND p.is_limited_edition = ?';
    params.push(is_limited_edition === 'true' || is_limited_edition === '1' ? 1 : 0);
  }
  if (is_resale !== undefined) {
    query += ' AND p.is_resale = ?';
    params.push(is_resale === 'true' || is_resale === '1' ? 1 : 0);
  }
  if (search) {
    query += ' AND (p.name ILIKE ? OR p.brand ILIKE ? OR p.description ILIKE ? OR p.sku ILIKE ?)';
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam, searchParam);
  }

  // Count total items for pagination metadata
  let countQuery = query.replace(
    /SELECT p\.\*, c\.name as category_name, s\.name as section_name, s\.slug as section_slug/,
    'SELECT COUNT(*) as count'
  );

  // Sort logic
  if (sort === 'price-low') {
    query += ' ORDER BY p.price ASC';
  } else if (sort === 'price-high') {
    query += ' ORDER BY p.price DESC';
  } else if (sort === 'newest') {
    query += ' ORDER BY p.created_at DESC';
  } else {
    // Default: Featured first, then newest
    query += ' ORDER BY p.is_featured DESC, p.created_at DESC';
  }
  
  try {
    const countRow = await db.get(countQuery, params);
    const totalItems = countRow ? Number(countRow.count) : 0;

    // Pagination
    const offset = (Number(page) - 1) * Number(limit);
    query += ' LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);

    const products = await db.all(query, params);
    await enrichProducts(products);

    res.json({
      products,
      pagination: {
        totalItems,
        currentPage: Number(page),
        totalPages: Math.ceil(totalItems / Number(limit)),
        limit: Number(limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
});

// Single Product detail (by ID or SLUG)
app.get('/api/products/:identifier', getCachedResponse, async (req, res) => {
  const ident = req.params.identifier;
  // Skip this route for 'homepage' (handled above)
  if (ident === 'homepage') return res.status(404).json({ error: 'Not found.' });

  let product;
  try {
    const baseQuery = `SELECT p.*, c.name as category_name, s.name as section_name, s.slug as section_slug
                       FROM public.products p
                       LEFT JOIN public.categories c ON p.category_id = c.id
                       LEFT JOIN public.store_sections s ON p.section_id = s.id`;

    if (/^\d+$/.test(ident)) {
      product = await db.get(`${baseQuery} WHERE p.id = ? AND p.enabled = 1`, [Number(ident)]);
    } else {
      product = await db.get(`${baseQuery} WHERE p.slug = ? AND p.enabled = 1`, [ident]);
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    // Parallelize inventory & image fetches, parsing tags beforehand
    try { product.sizes = JSON.parse(product.sizes || '[]'); } catch(e) { product.sizes = []; }
    try { product.colors = JSON.parse(product.colors || '[]'); } catch(e) { product.colors = []; }

    const [sizeInventory, images] = await Promise.all([
      db.all(
        'SELECT size, stock FROM public.product_size_inventory WHERE product_id = ? ORDER BY CAST(size AS REAL)',
        [product.id]
      ),
      db.all(
        'SELECT * FROM public.product_images WHERE product_id = ? ORDER BY sort_order, id',
        [product.id]
      )
    ]);

    product.size_inventory = sizeInventory || [];
    product.images = images || [];
    const primaryImg = product.images.find(img => img.is_primary === 1 || img.is_primary === true) || product.images[0];
    if (primaryImg) {
      product.image_url = primaryImg.url;
    }

    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch product.' });
  }
});

// Product size inventory (per-size stock)
app.get('/api/products/:id/sizes', async (req, res) => {
  try {
    const sizes = await db.all(
      'SELECT size, stock FROM public.product_size_inventory WHERE product_id = ? ORDER BY CAST(size AS REAL)',
      [req.params.id]
    );
    res.json(sizes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch size inventory.' });
  }
});

// Product images
app.get('/api/products/:id/images', async (req, res) => {
  try {
    const images = await db.all(
      'SELECT * FROM public.product_images WHERE product_id = ? ORDER BY sort_order, id',
      [req.params.id]
    );
    res.json(images);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product images.' });
  }
});

// Related products (You May Also Like)
app.get('/api/products/:id/related', getCachedResponse, async (req, res) => {
  try {
    const prodId = Number(req.params.id);
    const prod = await db.get('SELECT category_id, section_id, brand FROM public.products WHERE id = ?', [prodId]);
    if (!prod) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const query = `
      SELECT p.*, c.name as category_name, s.name as section_name
      FROM public.products p
      LEFT JOIN public.categories c ON p.category_id = c.id
      LEFT JOIN public.store_sections s ON p.section_id = s.id
      WHERE p.id != ? AND p.enabled = 1
      ORDER BY (
        (CASE WHEN p.category_id = ? THEN 4 ELSE 0 END) +
        (CASE WHEN p.brand = ? THEN 2 ELSE 0 END) +
        (CASE WHEN p.section_id = ? THEN 1 ELSE 0 END)
      ) DESC, p.id DESC
      LIMIT 8
    `;
    const related = await db.all(query, [prodId, prod.category_id, prod.brand, prod.section_id]);
    await enrichProducts(related);
    res.json(related);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch related products.' });
  }
});

// 5. Search Endpoint
app.get('/api/search', getCachedResponse, async (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.json([]);
  }
  try {
    const term = `%${q}%`;
    const products = await db.all(
      `SELECT p.*, c.name as category_name, s.name as section_name
       FROM public.products p
       LEFT JOIN public.categories c ON p.category_id = c.id
       LEFT JOIN public.store_sections s ON p.section_id = s.id
       WHERE p.enabled = 1 AND (p.name ILIKE ? OR p.brand ILIKE ? OR c.name ILIKE ? OR s.name ILIKE ? OR p.sku ILIKE ? OR p.description ILIKE ?)`,
      [term, term, term, term, term, term]
    );
    await enrichProducts(products);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Search failed.' });
  }
});

// 6. Cart Endpoints (Require Auth)
app.get('/api/cart', requireAuth, async (req, res) => {
  try {
    const items = await db.all(
      `SELECT c.id, c.product_id, c.size, c.quantity, p.name, p.brand, p.price, p.image_url, p.slug,
              COALESCE(psi.stock, 0) as available_stock
       FROM public.cart c
       JOIN public.products p ON c.product_id = p.id
       LEFT JOIN public.product_size_inventory psi ON psi.product_id = c.product_id AND psi.size = c.size
       WHERE c.user_id = ?`,
      [req.user.id],
      req.user
    );
    // Enrich each cart item with its primary image
    for (const item of items) {
      const primaryImg = await db.get(
        'SELECT url FROM public.product_images WHERE product_id = ? AND is_primary = 1 LIMIT 1',
        [item.product_id]
      );
      if (primaryImg) item.image_url = primaryImg.url;
    }
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve cart items.' });
  }
});

app.post('/api/cart', requireAuth, async (req, res) => {
  const { product_id, size, quantity = 1 } = req.body;
  if (!product_id || !size) {
    return res.status(400).json({ error: 'Product ID and size are required.' });
  }

  try {
    // Check per-size stock
    const sizeStock = await db.get(
      'SELECT stock FROM public.product_size_inventory WHERE product_id = ? AND size = ?',
      [product_id, String(size)]
    );

    // Fallback to product-level stock if per-size not available
    const product = await db.get('SELECT stock, enabled FROM public.products WHERE id = ?', [product_id]);
    if (!product || !product.enabled) {
      return res.status(404).json({ error: 'Product is unavailable.' });
    }

    const availableStock = sizeStock !== null ? sizeStock.stock : product.stock;
    if (availableStock !== null && availableStock < 1) {
      return res.status(400).json({ error: `Size ${size} is out of stock.` });
    }
    if (availableStock < quantity) {
      return res.status(400).json({ error: `Only ${availableStock} items left in stock for size ${size}.` });
    }

    // Check if product with this size already in cart
    const existing = await db.get(
      'SELECT id, quantity FROM public.cart WHERE user_id = ? AND product_id = ? AND size = ?',
      [req.user.id, product_id, size],
      req.user
    );

    if (existing) {
      const newQty = existing.quantity + Number(quantity);
      if (availableStock < newQty) {
        return res.status(400).json({ error: `Cannot add more. Only ${availableStock} items in stock for size ${size}.` });
      }
      await db.run('UPDATE public.cart SET quantity = ? WHERE id = ?', [newQty, existing.id], req.user);
    } else {
      await db.run(
        'INSERT INTO public.cart (user_id, product_id, size, quantity) VALUES (?, ?, ?, ?)',
        [req.user.id, product_id, size, Number(quantity)],
        req.user
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update cart.' });
  }
});

app.put('/api/cart/:id', requireAuth, async (req, res) => {
  const cartId = req.params.id;
  const { quantity } = req.body;
  
  if (quantity === undefined || Number(quantity) < 1) {
    return res.status(400).json({ error: 'Quantity must be at least 1.' });
  }

  try {
    const item = await db.get('SELECT product_id, size FROM public.cart WHERE id = ? AND user_id = ?', [cartId, req.user.id], req.user);
    if (!item) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    const sizeStock = await db.get(
      'SELECT stock FROM public.product_size_inventory WHERE product_id = ? AND size = ?',
      [item.product_id, item.size]
    );
    const product = await db.get('SELECT stock FROM public.products WHERE id = ?', [item.product_id]);
    const availableStock = sizeStock ? sizeStock.stock : (product ? product.stock : 0);

    if (availableStock < Number(quantity)) {
      return res.status(400).json({ error: `Only ${availableStock} items in stock for size ${item.size}.` });
    }

    await db.run('UPDATE public.cart SET quantity = ? WHERE id = ?', [Number(quantity), cartId], req.user);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update quantity.' });
  }
});

app.delete('/api/cart/:id', requireAuth, async (req, res) => {
  const cartId = req.params.id;
  try {
    await db.run('DELETE FROM public.cart WHERE id = ? AND user_id = ?', [cartId, req.user.id], req.user);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete cart item.' });
  }
});

app.delete('/api/cart', requireAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM public.cart WHERE user_id = ?', [req.user.id], req.user);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear cart.' });
  }
});

// 7. Wishlist Endpoints (Require Auth)
app.get('/api/wishlist', requireAuth, async (req, res) => {
  try {
    const items = await db.all(
      `SELECT w.id, w.product_id, p.name, p.brand, p.price, p.image_url, p.slug
       FROM public.wishlist w
       JOIN public.products p ON w.product_id = p.id
       WHERE w.user_id = ?`,
      [req.user.id],
      req.user
    );
    for (const item of items) {
      const primaryImg = await db.get(
        'SELECT url FROM public.product_images WHERE product_id = ? AND is_primary = 1 LIMIT 1',
        [item.product_id]
      );
      if (primaryImg) item.image_url = primaryImg.url;
    }
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve wishlist items.' });
  }
});

app.post('/api/wishlist', requireAuth, async (req, res) => {
  const { product_id } = req.body;
  if (!product_id) {
    return res.status(400).json({ error: 'Product ID is required.' });
  }

  try {
    const existing = await db.get('SELECT id FROM public.wishlist WHERE user_id = ? AND product_id = ?', [req.user.id, product_id], req.user);
    if (!existing) {
      await db.run('INSERT INTO public.wishlist (user_id, product_id) VALUES (?, ?)', [req.user.id, product_id], req.user);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add to wishlist.' });
  }
});

app.delete('/api/wishlist/:productId', requireAuth, async (req, res) => {
  const prodId = req.params.productId;
  try {
    await db.run('DELETE FROM public.wishlist WHERE user_id = ? AND product_id = ?', [req.user.id, prodId], req.user);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove from wishlist.' });
  }
});

// 8. Profile Address & Security Dashboard Endpoints
app.get('/api/addresses', requireAuth, async (req, res) => {
  try {
    const addr = await db.all('SELECT * FROM public.addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', [req.user.id], req.user);
    res.json(addr);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch addresses.' });
  }
});

app.post('/api/addresses', requireAuth, async (req, res) => {
  const { full_name, phone, address_line1, address_line2, city, state, postal_code, is_default = 0 } = req.body;
  
  if (!full_name || !phone || !address_line1 || !city || !state || !postal_code) {
    return res.status(400).json({ error: 'Required fields are missing.' });
  }
  // Regex validation
  if (!/^\d{10}$/.test(phone.replace(/\s+/g, ''))) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit phone number.' });
  }
  if (!/^\d{6}$/.test(postal_code.trim())) {
    return res.status(400).json({ error: 'Please enter a valid 6-digit postal code.' });
  }

  try {
    if (is_default) {
      await db.run('UPDATE public.addresses SET is_default = 0 WHERE user_id = ?', [req.user.id], req.user);
    }
    await db.run(
      `INSERT INTO public.addresses (user_id, full_name, phone, address_line1, address_line2, city, state, postal_code, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, full_name, phone, address_line1, address_line2, city, state, postal_code, is_default ? 1 : 0],
      req.user
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create address.' });
  }
});

app.delete('/api/addresses/:id', requireAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM public.addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], req.user);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete address.' });
  }
});

app.put('/api/profile', requireAuth, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    // Check unique email
    const other = await db.get('SELECT id FROM public.users WHERE email = ? AND id != ?', [email, req.user.id]);
    if (other) {
      return res.status(400).json({ error: 'Email is already taken.' });
    }

    if (supabase && db.isPostgres) {
      // Update email in Supabase Auth
      const { error } = await supabase.auth.admin.updateUserById(req.user.id, { email });
      if (error) {
        return res.status(400).json({ error: error.message });
      }
    }

    await db.run('UPDATE public.users SET email = ? WHERE id = ?', [email, req.user.id], req.user);
    
    // Update cookie for SQLite fallback
    const updated = await db.get('SELECT id, username, email, role FROM public.users WHERE id = ?', [req.user.id]);
    if (!supabase) {
      const token = jwt.sign(updated, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    }
    
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

app.put('/api/profile/security', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new passwords are required.' });
  }

  try {
    if (supabase && db.isPostgres) {
      // In Supabase, password updates can be done using updateUserById after verifying credentials
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: req.user.email,
        password: current_password
      });
      if (signInErr) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }

      if (new_password.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
      }

      const { error: updateErr } = await supabase.auth.admin.updateUserById(req.user.id, {
        password: new_password
      });
      if (updateErr) {
        return res.status(400).json({ error: updateErr.message });
      }
    } else {
      // Local development SQLite fallback
      const user = await db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
      const match = bcrypt.compareSync(current_password, user.password_hash);
      if (!match) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }

      if (new_password.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
      }

      const hashed = bcrypt.hashSync(new_password, 10);
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashed, req.user.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

// 9. Promo Validation
app.post('/api/coupons/validate', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Coupon code required.' });
  }

  try {
    const coupon = await db.get('SELECT * FROM public.coupons WHERE code = ? AND active = 1', [code.toUpperCase()]);
    if (!coupon) {
      return res.status(404).json({ error: 'Invalid or expired coupon.' });
    }
    res.json(coupon);
  } catch (err) {
    res.status(500).json({ error: 'Error validating coupon.' });
  }
});

// 10. Checkout & Orders
app.post('/api/orders', requireAuth, async (req, res) => {
  let { promo_code, shipping_address, payment_method } = req.body;
  if (!payment_method || payment_method === 'Online Payment') {
    payment_method = 'COD';
  }
  
  if (!shipping_address) {
    return res.status(400).json({ error: 'Shipping address is required.' });
  }

  // Ensure Name, Email, Phone, Locality, State, Pincode are present in shipping_address
  const requiredKeys = ['Name:', 'Email:', 'Phone:', 'Locality:', 'State:', 'Pincode:'];
  const hasAllKeys = requiredKeys.every(key => shipping_address.includes(key));
  if (!hasAllKeys) {
    return res.status(400).json({ error: 'Incomplete shipping information. Name, email, phone, pincode, state, and locality are required.' });
  }

  // Block UPI checkouts
  if (payment_method !== 'COD') {
    return res.status(400).json({ error: 'Only Cash on Delivery (COD) is available at this time.' });
  }

  try {
    // Get cart items
    const cartItems = await db.all(
      `SELECT c.product_id, c.size, c.quantity, p.price, p.stock, p.name 
       FROM public.cart c
       JOIN public.products p ON c.product_id = p.id
       WHERE c.user_id = ?`,
      [req.user.id],
      req.user
    );

    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Your bag is empty.' });
    }

    // Verify per-size stock
    for (const item of cartItems) {
      const sizeStock = await db.get(
        'SELECT stock FROM public.product_size_inventory WHERE product_id = ? AND size = ?',
        [item.product_id, item.size]
      );
      const availStock = sizeStock ? sizeStock.stock : item.stock;
      if (availStock < item.quantity) {
        return res.status(400).json({ error: `Not enough stock for ${item.name} (Size ${item.size}). Only ${availStock} left.` });
      }
    }

    // Calculate subtotal
    let subtotal = 0;
    cartItems.forEach(item => {
      subtotal += item.price * item.quantity;
    });

    // Check discount
    let discount = 0;
    if (promo_code) {
      const coupon = await db.get('SELECT discount_percent FROM public.coupons WHERE code = ? AND active = 1', [promo_code.toUpperCase()]);
      if (coupon) {
        discount = (subtotal * coupon.discount_percent) / 100;
      }
    }

    const discountedSubtotal = subtotal - discount;

    // Load settings from database dynamically
    const settingsRows = await db.all('SELECT * FROM public.settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });
    const taxRate = parseFloat(settings.tax_rate || '0.18');
    const shippingCost = parseFloat(settings.shipping_cost || '0');

    const tax = discountedSubtotal * taxRate;
    const shipping = shippingCost;
    const total = discountedSubtotal + tax + shipping;

    // Generate invoice number
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastOrder = await db.get('SELECT id FROM public.orders ORDER BY id DESC LIMIT 1');
    const nextId = lastOrder ? lastOrder.id + 1 : 1;
    const invoiceNumber = `MG-INV-${ym}-${String(nextId).padStart(5, '0')}`;

    // Create Order record
    const trackingNum = 'MG-' + Math.floor(100000 + Math.random() * 900000);
    await db.run(
      `INSERT INTO public.orders (user_id, status, subtotal, shipping, tax, total, promo_code, shipping_address, payment_method, invoice_number, tracking_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, 'Pending', subtotal, shipping, tax, total, promo_code || null, shipping_address, payment_method, invoiceNumber, trackingNum],
      req.user
    );

    // Get last inserted order ID
    const newOrder = await db.get('SELECT id FROM public.orders WHERE user_id = ? ORDER BY id DESC LIMIT 1', [req.user.id], req.user);
    const orderId = newOrder.id;

    // Insert order items & update product and size stock
    for (const item of cartItems) {
      await db.run(
        'INSERT INTO public.order_items (order_id, product_id, size, quantity, price) VALUES (?, ?, ?, ?, ?)',
        [orderId, item.product_id, item.size, item.quantity, item.price]
      );
      // Decrement per-size stock
      await db.run(
        'UPDATE public.product_size_inventory SET stock = MAX(0, stock - ?) WHERE product_id = ? AND size = ?',
        [item.quantity, item.product_id, item.size]
      );
      // Also update product overall stock
      await db.run(
        'UPDATE public.products SET stock = MAX(0, stock - ?) WHERE id = ?',
        [item.quantity, item.product_id]
      );
    }

    // Clear user cart
    await db.run('DELETE FROM public.cart WHERE user_id = ?', [req.user.id], req.user);

    // Invalidate cached product catalogs due to stock level changes
    clearCache();

    // Trigger order confirmation notification
    const notifications = require('./notifications');
    notifications.triggerNotification(orderId, 'order_placed').catch(err => {
      console.error('Failed to send order confirmation notification:', err);
    });

    res.json({ success: true, orderId, total, trackingNumber: trackingNum, invoiceNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Checkout failed.' });
  }
});

app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const userOrders = await db.all('SELECT * FROM public.orders WHERE user_id = ? ORDER BY id DESC', [req.user.id], req.user);
    
    const ordersWithItems = [];
    for (const o of userOrders) {
      const items = await db.all(
        `SELECT oi.*, p.name, p.brand, p.image_url, p.slug
         FROM public.order_items oi
         JOIN public.products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [o.id]
      );
      // Enrich images
      for (const item of items) {
        const primaryImg = await db.get(
          'SELECT url FROM public.product_images WHERE product_id = ? AND is_primary = 1 LIMIT 1',
          [item.product_id]
        );
        if (primaryImg) item.image_url = primaryImg.url;
      }
      o.items = items;
      ordersWithItems.push(o);
    }

    res.json(ordersWithItems);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve orders.' });
  }
});

// Invoice endpoint - returns full invoice data for PDF generation
app.get('/api/orders/:id/invoice', requireAuth, async (req, res) => {
  const orderId = req.params.id;
  try {
    let order;
    const isStaffOrAdmin = ['owner', 'admin', 'staff'].includes(req.user.role);
    if (isStaffOrAdmin) {
      order = await db.get(
        `SELECT o.*, u.username, u.email
         FROM public.orders o
         JOIN public.users u ON o.user_id = u.id
         WHERE o.id = ?`,
        [orderId]
      );
    } else {
      order = await db.get(
        `SELECT o.*, u.username, u.email
         FROM public.orders o
         JOIN public.users u ON o.user_id = u.id
         WHERE o.id = ? AND o.user_id = ?`,
        [orderId, req.user.id],
        req.user
      );
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const items = await db.all(
      `SELECT oi.*, p.name, p.brand, p.sku
       FROM public.order_items oi
       JOIN public.products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    const settingsRows = await db.all('SELECT * FROM public.settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });

    res.json({ order, items, settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate invoice data.' });
  }
});

// ==========================================
// ADMIN API ROUTES
// ==========================================

// Multer Storage Configuration for Product Image Uploads
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|webp|gif/;
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    if (allowedTypes.test(ext) && allowedTypes.test(mime)) {
      return cb(null, true);
    }
    cb(new Error('Only images are allowed (jpeg, jpg, png, webp, gif)'));
  }
});

app.post('/api/admin/upload', requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }

  try {
    if (supabase && db.isPostgres) {
      // Upload to Supabase Storage
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(req.file.originalname).toLowerCase();
      const fileName = `product-${uniqueSuffix}${ext}`;
      
      const { data, error } = await supabaseAdmin.storage
        .from('product-images')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('product-images')
        .getPublicUrl(fileName);

      return res.json({ success: true, url: publicUrl });
    } else {
      // Local SQLite fallback - write file to public/uploads
      const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(req.file.originalname).toLowerCase();
      const filename = `image-${uniqueSuffix}${ext}`;
      const filePath = path.join(uploadDir, filename);
      
      fs.writeFileSync(filePath, req.file.buffer);
      
      const fileUrl = `/uploads/${filename}`;
      return res.json({ success: true, url: fileUrl });
    }
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload image: ' + err.message });
  }
}, (error, req, res, next) => {
  res.status(400).json({ error: error.message });
});

// Middleware to clear public catalog cache on any non-GET admin request
app.use('/api/admin', (req, res, next) => {
  if (req.method !== 'GET') {
    clearCache();
  }
  next();
});

// 1. Analytics
app.get('/api/admin/analytics', requireStaff, async (req, res) => {
  try {
    const revenueObj = await db.get("SELECT SUM(total) as total FROM orders WHERE status != 'Cancelled'");
    const revenue = revenueObj ? (revenueObj.total || 0) : 0;

    const customersCountObj = await db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['customer']);
    const customersCount = customersCountObj ? customersCountObj.count : 0;
    
    const ordersCountObj = await db.get('SELECT COUNT(*) as count FROM orders');
    const ordersCount = ordersCountObj ? ordersCountObj.count : 0;
    
    const productsCountObj = await db.get('SELECT COUNT(*) as count FROM products');
    const productsCount = productsCountObj ? productsCountObj.count : 0;

    res.json({
      revenue: Math.round(revenue),
      customers: Number(customersCount),
      orders: Number(ordersCount),
      products: Number(productsCount),
      sessions: '18.4K', // Simulated metric
      hype: 93 // Simulated metric
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch analytics.' });
  }
});

// 2. Products Inventory CRUD
app.get('/api/admin/products', requireStaff, async (req, res) => {
  try {
    let query = `
      SELECT p.*, c.name as category_name, s.name as section_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN store_sections s ON p.section_id = s.id
    `;
    let countQuery = `
      SELECT COUNT(*) as count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN store_sections s ON p.section_id = s.id
    `;
    let whereClauses = [];
    let params = [];
    let countParams = [];

    if (req.query.search) {
      const searchPattern = `%${req.query.search.trim()}%`;
      whereClauses.push(`(p.name LIKE ? OR p.brand LIKE ? OR p.sku LIKE ?)`);
      params.push(searchPattern, searchPattern, searchPattern);
      countParams.push(searchPattern, searchPattern, searchPattern);
    }
    if (req.query.category) {
      whereClauses.push(`p.category_id = ?`);
      params.push(parseInt(req.query.category));
      countParams.push(parseInt(req.query.category));
    }
    if (req.query.status) {
      const enabledVal = req.query.status === 'active' ? 1 : 0;
      whereClauses.push(`p.enabled = ?`);
      params.push(enabledVal);
      countParams.push(enabledVal);
    }

    if (whereClauses.length > 0) {
      const clause = ` WHERE ` + whereClauses.join(' AND ');
      query += clause;
      countQuery += clause;
    }

    query += ` ORDER BY p.id DESC`;

    if (req.query.page) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 15;
      const offset = (page - 1) * limit;

      query += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const totalRow = await db.get(countQuery, countParams);
      const total = totalRow ? totalRow.count : 0;
      const pages = Math.ceil(total / limit) || 1;

      const products = await db.all(query, params);
      await enrichProducts(products);

      res.json({
        products,
        total,
        pages,
        page,
        limit
      });
    } else {
      const products = await db.all(query, params);
      await enrichProducts(products);
      res.json(products);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products inventory.' });
  }
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const { name, brand, category_id, section_id, sku, price, description, image_url, sizes, colors, stock, is_featured, is_new_arrival, is_limited_edition, is_resale, size_inventory, images } = req.body;

  if (!name || !brand || !price || !sku) {
    return res.status(400).json({ error: 'Required fields are missing (name, brand, price, sku).' });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  try {
    const existing = await db.get('SELECT id FROM products WHERE slug = ? OR sku = ?', [slug, sku]);
    if (existing) {
      return res.status(400).json({ error: 'Product with this name or SKU already exists.' });
    }

    let finalImageUrl = image_url || '';
    if (Array.isArray(images) && images.length > 0) {
      const primaryImg = images.find(img => img.is_primary === 1) || images[0];
      finalImageUrl = typeof primaryImg === 'string' ? primaryImg : primaryImg.url;
    }

    await db.run(
      `INSERT INTO products (name, slug, brand, category_id, section_id, sku, price, description, image_url, sizes, colors, stock, is_featured, is_new_arrival, is_limited_edition, is_resale, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        name, slug, brand,
        category_id ? Number(category_id) : null,
        section_id ? Number(section_id) : null,
        sku, Number(price),
        description || '',
        finalImageUrl,
        JSON.stringify(sizes || []),
        JSON.stringify(colors || []),
        Number(stock || 0),
        is_featured ? 1 : 0,
        is_new_arrival ? 1 : 0,
        is_limited_edition ? 1 : 0,
        is_resale ? 1 : 0
      ]
    );

    const newProd = await db.get('SELECT id FROM products WHERE slug = ?', [slug]);
    if (newProd) {
      // Add product images
      if (Array.isArray(images) && images.length > 0) {
        for (let idx = 0; idx < images.length; idx++) {
          const img = images[idx];
          const url = typeof img === 'string' ? img : img.url;
          const is_primary = typeof img === 'string' ? (idx === 0 ? 1 : 0) : (img.is_primary ? 1 : 0);
          await db.run(
            'INSERT INTO product_images (product_id, url, sort_order, is_primary) VALUES (?, ?, ?, ?)',
            [newProd.id, url, idx, is_primary]
          );
        }
      } else if (finalImageUrl) {
        await db.run(
          'INSERT INTO product_images (product_id, url, sort_order, is_primary) VALUES (?, ?, 0, 1)',
          [newProd.id, finalImageUrl]
        );
      }

      // Seed per-size inventory
      const sizesArr = sizes || [];
      if (Array.isArray(size_inventory) && size_inventory.length > 0) {
        for (const si of size_inventory) {
          await db.run(
            'INSERT OR REPLACE INTO product_size_inventory (product_id, size, stock) VALUES (?, ?, ?)',
            [newProd.id, String(si.size), Number(si.stock || 0)]
          );
        }
      } else if (sizesArr.length > 0) {
        const baseStock = Math.floor(Number(stock || 0) / sizesArr.length);
        for (const sz of sizesArr) {
          await db.run(
            'INSERT OR IGNORE INTO product_size_inventory (product_id, size, stock) VALUES (?, ?, ?)',
            [newProd.id, String(sz), baseStock]
          );
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const prodId = req.params.id;
  const { name, brand, category_id, section_id, sku, price, description, image_url, sizes, colors, stock, is_featured, is_new_arrival, is_limited_edition, is_resale, enabled, size_inventory, images } = req.body;

  if (!name || !brand || !price || !sku) {
    return res.status(400).json({ error: 'Required fields are missing.' });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  try {
    const existing = await db.get('SELECT id FROM products WHERE (slug = ? OR sku = ?) AND id != ?', [slug, sku, prodId]);
    if (existing) {
      return res.status(400).json({ error: 'Product SKU or slug name is already in use.' });
    }

    let finalImageUrl = image_url;
    if (Array.isArray(images) && images.length > 0) {
      const primaryImg = images.find(img => img.is_primary === 1) || images[0];
      finalImageUrl = typeof primaryImg === 'string' ? primaryImg : primaryImg.url;
    }

    await db.run(
      `UPDATE products 
       SET name = ?, slug = ?, brand = ?, category_id = ?, section_id = ?, sku = ?, price = ?, description = ?, image_url = ?, sizes = ?, colors = ?, stock = ?, is_featured = ?, is_new_arrival = ?, is_limited_edition = ?, is_resale = ?, enabled = ?
       WHERE id = ?`,
      [
        name, slug, brand,
        category_id ? Number(category_id) : null,
        section_id ? Number(section_id) : null,
        sku, Number(price),
        description || '',
        finalImageUrl,
        JSON.stringify(sizes || []),
        JSON.stringify(colors || []),
        Number(stock || 0),
        is_featured ? 1 : 0,
        is_new_arrival ? 1 : 0,
        is_limited_edition ? 1 : 0,
        is_resale ? 1 : 0,
        enabled ? 1 : 0,
        prodId
      ]
    );

    // Update product images if provided
    if (Array.isArray(images)) {
      await db.run('DELETE FROM product_images WHERE product_id = ?', [prodId]);
      for (let idx = 0; idx < images.length; idx++) {
        const img = images[idx];
        const url = typeof img === 'string' ? img : img.url;
        const is_primary = typeof img === 'string' ? (idx === 0 ? 1 : 0) : (img.is_primary ? 1 : 0);
        await db.run(
          'INSERT INTO product_images (product_id, url, sort_order, is_primary) VALUES (?, ?, ?, ?)',
          [prodId, url, idx, is_primary]
        );
      }
    }

    // Update per-size inventory if provided
    if (Array.isArray(size_inventory)) {
      for (const si of size_inventory) {
        await db.run(
          'INSERT OR REPLACE INTO product_size_inventory (product_id, size, stock) VALUES (?, ?, ?)',
          [prodId, String(si.size), Number(si.stock || 0)]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

app.delete('/api/admin/products/:id', requireAdmin, requireSudo, async (req, res) => {
  try {
    const id = req.params.id;
    // Log action to audit logs
    const product = await db.get('SELECT name FROM products WHERE id = ?', [id]);
    if (product) {
      await logAuditAction(req.user.id, 'DELETE_PRODUCT', `Deleted product: ${product.name} (ID: ${id})`);
    }

    await db.run('DELETE FROM cart WHERE product_id = ?', [id]);
    await db.run('DELETE FROM wishlist WHERE product_id = ?', [id]);
    await db.run('DELETE FROM product_size_inventory WHERE product_id = ?', [id]);
    await db.run('DELETE FROM product_images WHERE product_id = ?', [id]);
    await db.run('DELETE FROM products WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

// Per-size inventory admin endpoints
app.post('/api/admin/products/:id/sizes', requireAdmin, async (req, res) => {
  const { size_inventory } = req.body; // [{ size, stock }, ...]
  if (!Array.isArray(size_inventory)) {
    return res.status(400).json({ error: 'size_inventory array is required.' });
  }
  try {
    for (const si of size_inventory) {
      await db.run(
        'INSERT OR REPLACE INTO product_size_inventory (product_id, size, stock) VALUES (?, ?, ?)',
        [req.params.id, String(si.size), Number(si.stock || 0)]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update size inventory.' });
  }
});

// Product images admin endpoints
app.post('/api/admin/products/:id/images', requireAdmin, async (req, res) => {
  const { url, is_primary = 0 } = req.body;
  if (!url) return res.status(400).json({ error: 'Image URL is required.' });
  try {
    const maxOrder = await db.get('SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?', [req.params.id]);
    const nextOrder = (maxOrder && maxOrder.max_order !== null) ? maxOrder.max_order + 1 : 0;

    if (is_primary) {
      await db.run('UPDATE product_images SET is_primary = 0 WHERE product_id = ?', [req.params.id]);
    }
    await db.run(
      'INSERT INTO product_images (product_id, url, sort_order, is_primary) VALUES (?, ?, ?, ?)',
      [req.params.id, url, nextOrder, is_primary ? 1 : 0]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add image.' });
  }
});

app.put('/api/admin/products/:id/images/reorder', requireAdmin, async (req, res) => {
  const { order } = req.body; // [{ id, sort_order }, ...]
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required.' });
  try {
    for (const item of order) {
      await db.run(
        'UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?',
        [item.sort_order, item.id, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reorder images.' });
  }
});

app.put('/api/admin/products/:id/images/:imgId/primary', requireAdmin, async (req, res) => {
  try {
    await db.run('UPDATE product_images SET is_primary = 0 WHERE product_id = ?', [req.params.id]);
    await db.run('UPDATE product_images SET is_primary = 1 WHERE id = ? AND product_id = ?', [req.params.imgId, req.params.id]);
    // Sync image_url on products table
    const img = await db.get('SELECT url FROM product_images WHERE id = ?', [req.params.imgId]);
    if (img) await db.run('UPDATE products SET image_url = ? WHERE id = ?', [img.url, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set primary image.' });
  }
});

app.delete('/api/admin/products/:id/images/:imgId', requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM product_images WHERE id = ? AND product_id = ?', [req.params.imgId, req.params.id]);
    // If no images left or primary was deleted, set new primary
    const remaining = await db.all('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order LIMIT 1', [req.params.id]);
    if (remaining.length > 0) {
      const hasPrimary = await db.get('SELECT id FROM product_images WHERE product_id = ? AND is_primary = 1', [req.params.id]);
      if (!hasPrimary) {
        await db.run('UPDATE product_images SET is_primary = 1 WHERE id = ?', [remaining[0].id]);
        await db.run('UPDATE products SET image_url = ? WHERE id = ?', [remaining[0].url, req.params.id]);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete image.' });
  }
});

// 3. Customer management
app.get('/api/admin/customers', requireStaff, async (req, res) => {
  try {
    let query = `SELECT id, username, email, created_at FROM users WHERE role = ?`;
    let countQuery = `SELECT COUNT(*) as count FROM users WHERE role = ?`;
    let params = ['customer'];
    let countParams = ['customer'];

    if (req.query.search) {
      const searchPattern = `%${req.query.search.trim()}%`;
      query += ` AND (username LIKE ? OR email LIKE ?)`;
      countQuery += ` AND (username LIKE ? OR email LIKE ?)`;
      params.push(searchPattern, searchPattern);
      countParams.push(searchPattern, searchPattern);
    }

    query += ` ORDER BY id DESC`;

    if (req.query.page) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 15;
      const offset = (page - 1) * limit;

      query += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const totalRow = await db.get(countQuery, countParams);
      const total = totalRow ? totalRow.count : 0;
      const pages = Math.ceil(total / limit) || 1;

      const customers = await db.all(query, params);
      res.json({
        customers,
        total,
        pages,
        page,
        limit
      });
    } else {
      const customers = await db.all(query, params);
      res.json(customers);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customers.' });
  }
});

// 4. Order management
app.get('/api/admin/orders', requireStaff, async (req, res) => {
  try {
    let query = `
      SELECT o.*, u.username, u.email 
      FROM orders o
      JOIN users u ON o.user_id = u.id
    `;
    let countQuery = `
      SELECT COUNT(*) as count 
      FROM orders o
      JOIN users u ON o.user_id = u.id
    `;
    let params = [];
    let countParams = [];

    // Optional status filter
    if (req.query.status) {
      query += ` WHERE o.status = ?`;
      countQuery += ` WHERE o.status = ?`;
      params.push(req.query.status);
      countParams.push(req.query.status);
    }

    query += ` ORDER BY o.id DESC`;

    if (req.query.page) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 15;
      const offset = (page - 1) * limit;

      query += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const totalRow = await db.get(countQuery, countParams);
      const total = totalRow ? totalRow.count : 0;
      const pages = Math.ceil(total / limit) || 1;

      const orders = await db.all(query, params);
      res.json({
        orders,
        total,
        pages,
        page,
        limit
      });
    } else {
      const allOrders = await db.all(query, params);
      res.json(allOrders);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

app.get('/api/admin/orders/:id', requireStaff, async (req, res) => {
  const orderId = req.params.id;
  try {
    const order = await db.get(
      `SELECT o.*, u.username, u.email 
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = ?`,
      [orderId]
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const items = await db.all(
      `SELECT oi.*, p.name, p.brand, p.image_url, p.slug, p.sku
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [orderId]
    );
    for (const item of items) {
      const primaryImg = await db.get(
        'SELECT url FROM product_images WHERE product_id = ? AND is_primary = 1 LIMIT 1',
        [item.product_id]
      );
      if (primaryImg) item.image_url = primaryImg.url;
    }

    // Notification timeline
    const timeline = await db.all(
      'SELECT type, event, status, created_at FROM notification_history WHERE order_id = ? ORDER BY id ASC',
      [orderId]
    );

    order.items = items;
    order.timeline = timeline;
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve order details.' });
  }
});

app.get('/api/admin/orders/:id/notifications', requireStaff, async (req, res) => {
  try {
    const logs = await db.all('SELECT * FROM notification_history WHERE order_id = ? ORDER BY id DESC', [req.params.id]);
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notification logs.' });
  }
});

app.put('/api/admin/orders/:id/status', requireStaff, async (req, res) => {
  const { status, courier_name, tracking_number, status_message, shipping_notes } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required.' });
  }
  try {
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const finalTrackingNum = tracking_number !== undefined ? tracking_number : order.tracking_number;
    const finalCourierName = courier_name !== undefined ? courier_name : order.courier_name;
    const finalShippingNotes = shipping_notes !== undefined ? shipping_notes : order.shipping_notes;

    await db.run(
      'UPDATE orders SET status = ?, tracking_number = ?, courier_name = ?, shipping_notes = ? WHERE id = ?',
      [status, finalTrackingNum, finalCourierName, finalShippingNotes, req.params.id]
    );

    // Save customized timeline update in notification_history if status_message is provided
    if (status_message) {
      await db.run(
        `INSERT INTO notification_history (order_id, user_id, type, event, recipient, message, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.params.id, req.user.id, 'timeline', status, 'system', status_message, 'sent']
      );
    }

    db.saveDatabase();

    const notifications = require('./notifications');
    notifications.triggerNotification(req.params.id, 'order_status_update', status_message).catch(err => {
      console.error('Failed to send order status update notification:', err);
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update order status.' });
  }
});

// 5. Category retrieval (public - product categories)
app.get('/api/categories', getCachedResponse, async (req, res) => {
  try {
    const cats = await db.all(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count
      FROM categories c 
      ORDER BY c.id
    `);
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories.' });
  }
});

// 6. Category CRUD (Admin)
app.post('/api/admin/categories', requireStaff, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  try {
    const existing = await db.get('SELECT id FROM categories WHERE name = ? OR slug = ?', [name, slug]);
    if (existing) {
      return res.status(400).json({ error: 'Category already exists.' });
    }
    await db.run('INSERT INTO categories (name, slug) VALUES (?, ?)', [name, slug]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

app.put('/api/admin/categories/:id', requireStaff, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  try {
    const existing = await db.get('SELECT id FROM categories WHERE (name = ? OR slug = ?) AND id != ?', [name, slug, req.params.id]);
    if (existing) {
      return res.status(400).json({ error: 'Category name or slug already in use.' });
    }
    await db.run('UPDATE categories SET name = ?, slug = ? WHERE id = ?', [name, slug, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update category.' });
  }
});

app.delete('/api/admin/categories/:id', requireAdmin, async (req, res) => {
  try {
    await db.run('UPDATE products SET category_id = NULL WHERE category_id = ?', [req.params.id]);
    await db.run('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category.' });
  }
});

// 7. Store Sections Admin CRUD
app.post('/api/admin/sections', requireStaff, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Section name is required.' });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  try {
    const existing = await db.get('SELECT id FROM store_sections WHERE name = ? OR slug = ?', [name, slug]);
    if (existing) return res.status(400).json({ error: 'Section already exists.' });
    await db.run('INSERT INTO store_sections (name, slug) VALUES (?, ?)', [name, slug]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create section.' });
  }
});

app.put('/api/admin/sections/:id', requireStaff, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Section name is required.' });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  try {
    await db.run('UPDATE store_sections SET name = ?, slug = ? WHERE id = ?', [name, slug, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update section.' });
  }
});

app.delete('/api/admin/sections/:id', requireAdmin, async (req, res) => {
  try {
    await db.run('UPDATE products SET section_id = NULL WHERE section_id = ?', [req.params.id]);
    await db.run('DELETE FROM store_sections WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete section.' });
  }
});

// 8. Coupon CRUD (Admin)
app.get('/api/admin/coupons', requireStaff, async (req, res) => {
  try {
    const coupons = await db.all('SELECT * FROM coupons ORDER BY id DESC');
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch coupons.' });
  }
});

app.post('/api/admin/coupons', requireStaff, async (req, res) => {
  const { code, discount_percent, active = 1 } = req.body;
  if (!code || discount_percent === undefined) {
    return res.status(400).json({ error: 'Coupon code and discount percentage are required.' });
  }
  const upperCode = code.toUpperCase().trim();
  try {
    const existing = await db.get('SELECT id FROM coupons WHERE code = ?', [upperCode]);
    if (existing) {
      return res.status(400).json({ error: 'Coupon code already exists.' });
    }
    await db.run(
      'INSERT INTO coupons (code, discount_percent, active) VALUES (?, ?, ?)',
      [upperCode, Number(discount_percent), active ? 1 : 0]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create coupon.' });
  }
});

app.delete('/api/admin/coupons/:id', requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM coupons WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete coupon.' });
  }
});

// 9. Bulk Product Actions (Admin)
app.post('/api/admin/products/bulk', requireAdmin, async (req, res) => {
  const { action, ids } = req.body;
  if (!action || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Invalid parameters. Action and non-empty IDs array are required.' });
  }

  if (action === 'delete') {
    // Sudo session verification check
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1' || req.hostname === 'localhost';
    const isLocalAdmin = isLocal && req.user && req.user.username === 'admin';
    
    if (!isLocalAdmin) {
      const sudoToken = req.cookies.sudo_token;
      if (!sudoToken) {
        return res.status(403).json({ error: 'sudo_required', message: 'Sudo verification required.' });
      }
      try {
        const decoded = jwt.verify(sudoToken, JWT_SECRET);
        if (decoded.id !== req.user.id) {
          throw new Error('User mismatch');
        }
      } catch (err) {
        res.clearCookie('sudo_token');
        return res.status(403).json({ error: 'sudo_required', message: 'Sudo session expired or invalid.' });
      }
    }
  }

  try {
    const placeholders = ids.map(() => '?').join(',');
    if (action === 'delete') {
      // Log to audit logs before deleting
      await logAuditAction(req.user.id, 'BULK_DELETE_PRODUCTS', `Deleted products with IDs: ${ids.join(', ')}`);

      await db.run(`DELETE FROM cart WHERE product_id IN (${placeholders})`, ids);
      await db.run(`DELETE FROM wishlist WHERE product_id IN (${placeholders})`, ids);
      await db.run(`DELETE FROM product_size_inventory WHERE product_id IN (${placeholders})`, ids);
      await db.run(`DELETE FROM product_images WHERE product_id IN (${placeholders})`, ids);
      await db.run(`DELETE FROM products WHERE id IN (${placeholders})`, ids);
    } else if (action === 'enable') {
      await db.run(`UPDATE products SET enabled = 1 WHERE id IN (${placeholders})`, ids);
    } else if (action === 'disable') {
      await db.run(`UPDATE products SET enabled = 0 WHERE id IN (${placeholders})`, ids);
    } else {
      return res.status(400).json({ error: 'Unknown action.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bulk action failed.' });
  }
});

// ==========================================
// TEAM MANAGEMENT & AUDIT LOGS API ROUTES
// ==========================================

app.get('/api/admin/team', requireAdmin, async (req, res) => {
  try {
    const team = await db.all(
      `SELECT id, username, email, role, created_at 
       FROM users 
       WHERE role IN ('owner', 'admin', 'staff') 
       ORDER BY created_at DESC`
    );
    res.json(team);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch team members.' });
  }
});

app.post('/api/admin/team', requireAdmin, requireSudo, async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !email || !password || !role) {
    return res.status(400).json({ error: 'Username, email, password, and role are required.' });
  }

  const validRoles = ['owner', 'admin', 'staff'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role selection.' });
  }

  // Username validation
  if (username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Username must be at least 3 characters and contain only letters, numbers, and underscores.' });
  }

  try {
    // Check if user exists locally
    const existing = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) {
      return res.status(400).json({ error: 'Username or email already exists in system.' });
    }

    let userId;
    if (supabaseAdmin && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // Create user via Supabase Admin Auth
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username }
      });
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      userId = data.user.id;
    }

    const bcrypt = require('bcryptjs');
    const passwordHash = bcrypt.hashSync(password, 10);

    if (supabaseAdmin && process.env.SUPABASE_SERVICE_ROLE_KEY && db.isPostgres) {
      // Save profile row in users table
      await db.run(
        'INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [userId, username, email, passwordHash, role]
      );
    } else {
      // Local SQLite fallback - let id auto-increment
      await db.run(
        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [username, email, passwordHash, role]
      );
      const created = await db.get('SELECT id FROM users WHERE username = ?', [username]);
      userId = created ? created.id : null;
    }

    await logAuditAction(req.user.id, 'ADD_TEAM_MEMBER', `Added team member: ${username} (${email}) as ${role}`);
    res.json({ success: true, userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create team member.' });
  }
});

app.put('/api/admin/team/:id', requireAdmin, requireSudo, async (req, res) => {
  const targetId = req.params.id;
  const { role } = req.body;

  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'You cannot change your own role.' });
  }

  const validRoles = ['owner', 'admin', 'staff', 'customer'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role selection.' });
  }

  try {
    const member = await db.get('SELECT username, role FROM users WHERE id = ?', [targetId]);
    if (!member) {
      return res.status(404).json({ error: 'Team member not found.' });
    }

    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, targetId]);
    await logAuditAction(req.user.id, 'UPDATE_TEAM_MEMBER_ROLE', `Updated role of ${member.username} from ${member.role} to ${role}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update team member role.' });
  }
});

app.delete('/api/admin/team/:id', requireAdmin, requireSudo, async (req, res) => {
  const targetId = req.params.id;

  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'You cannot remove yourself from the team.' });
  }

  try {
    const member = await db.get('SELECT username, email FROM users WHERE id = ?', [targetId]);
    if (!member) {
      return res.status(404).json({ error: 'Team member not found.' });
    }

    if (supabaseAdmin && process.env.SUPABASE_SERVICE_ROLE_KEY && !targetId.startsWith('local-')) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(targetId);
      if (error) {
        console.error('Supabase admin deleteUser error:', error);
      }
    }

    await db.run('DELETE FROM users WHERE id = ?', [targetId]);
    await logAuditAction(req.user.id, 'DELETE_TEAM_MEMBER', `Removed team member: ${member.username} (${member.email})`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove team member.' });
  }
});

app.get('/api/admin/audit-logs', requireAdmin, async (req, res) => {
  try {
    const logs = await db.all(
      `SELECT a.*, u.username, u.email 
       FROM audit_logs a 
       JOIN users u ON a.user_id = u.id 
       ORDER BY a.created_at DESC 
       LIMIT 100`
    );
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }
});

// ==========================================
// STOREFRONT PAGE ROUTING (HTML templates)
// ==========================================

const servePage = (filename) => {
  return (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', filename));
  };
};

// Protect Account Route
app.get('/account', requireAuth, servePage('account.html'));

// Protect Admin Route
app.get('/admin', requireAdmin, servePage('admin.html'));
app.get('/admin/*', requireAdmin, servePage('admin.html')); // handle nested admin clean URLs

// Public Clean routes
app.get('/', servePage('index.html'));
app.get('/shop', servePage('shop.html'));
app.get('/collection', servePage('shop.html'));
app.get('/new-arrivals', servePage('shop.html'));
app.get('/limited-edition', servePage('shop.html'));
app.get('/resale', servePage('shop.html'));
app.get('/cart', servePage('cart.html'));
app.get('/terms', servePage('terms.html'));

app.get('/product/:slug', (req, res) => {
  // Let client product.html read slug from window.location.pathname
  res.sendFile(path.join(__dirname, '..', 'public', 'product.html'));
});

app.get('/order-invoice/:id', requireAuth, async (req, res) => {
  const orderId = req.params.id;
  try {
    // 1. Authorize access
    let order;
    const isStaffOrAdmin = ['owner', 'admin', 'staff'].includes(req.user.role);
    if (isStaffOrAdmin) {
      order = await db.get(
        `SELECT o.*, u.username, u.email
         FROM public.orders o
         JOIN public.users u ON o.user_id = u.id
         WHERE o.id = ?`,
        [orderId]
      );
    } else {
      order = await db.get(
        `SELECT o.*, u.username, u.email
         FROM public.orders o
         JOIN public.users u ON o.user_id = u.id
         WHERE o.id = ? AND o.user_id = ?`,
        [orderId, req.user.id],
        req.user
      );
    }

    if (!order) {
      return res.status(404).send('<h1>Order not found or access denied.</h1>');
    }

    // Fetch items and settings
    const items = await db.all(
      `SELECT oi.*, p.name, p.brand, p.sku
       FROM public.order_items oi
       JOIN public.products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    const settingsRows = await db.all('SELECT * FROM public.settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });

    // Read template public/invoice.html
    const templatePath = path.join(__dirname, '..', 'public', 'invoice.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');
    
    // Inject absolute tailwind path & data
    htmlContent = htmlContent.replace('/js/tailwind.js', 'https://cdn.tailwindcss.com');
    const dataScript = `<script>window.INVOICE_DATA = ${JSON.stringify({ order, items, settings })};</script>`;
    htmlContent = htmlContent.replace('<script>', `${dataScript}\n  <script>`);

    // If Postgres is enabled and Supabase is configured, upload backup in background
    if (db.isPostgres && supabaseAdmin && process.env.SUPABASE_URL) {
      const fileName = `invoice_${orderId}.html`;
      supabaseAdmin.storage
        .from('invoices')
        .upload(fileName, Buffer.from(htmlContent, 'utf-8'), {
          contentType: 'text/html',
          upsert: true
        }).catch(uploadError => {
          console.error('Invoice backup upload failed:', uploadError);
        });
    }

    res.setHeader('Content-Type', 'text/html');
    return res.send(htmlContent);
  } catch (err) {
    console.error(err);
    res.status(500).send('<h1>Server error serving invoice.</h1>');
  }
});

// Login and Signup page logic (redirect to account if already logged in)
const guestOnlyPage = (filename) => {
  return (req, res) => {
    if (req.user) {
      return res.redirect('/account');
    }
    res.sendFile(path.join(__dirname, '..', 'public', filename));
  };
};

// Root route - serve home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/login', guestOnlyPage('login.html'));
app.get('/signup', guestOnlyPage('signup.html'));

// Fallback - serve index.html for SPA routing (without 404 status)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'), (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(404).json({ error: 'File not found' });
    }
  });
});

// Start Server (for local development and Vercel)
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`MAGMAZOES luxury streetwear store is online on http://localhost:${PORT}`);
  });
}

// Export for Vercel serverless functions
module.exports = app;
