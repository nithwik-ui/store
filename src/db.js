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

const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const dbDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dbDir, 'database.sqlite');

let db = null;
let SQL = null;
let pgPool = null;
let isPostgres = false;

// Check if PostgreSQL connection is configured
const pgConnString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (pgConnString) {
  isPostgres = true;
  pgPool = new Pool({
    connectionString: pgConnString,
    ssl: { rejectUnauthorized: false }
  });
  console.log('Database abstraction: configured for Supabase Postgres.');
} else {
  console.log('Database abstraction: configured for local sql.js SQLite.');
}

// SQL Query translation layer from SQLite to PostgreSQL dialect
function translateSql(query) {
  if (!isPostgres) {
    let sql = query.replace(/\bpublic\./gi, '');
    sql = sql.replace(/\bILIKE\b/gi, 'LIKE');
    return sql;
  }

  let sql = query;

  // Translate SQLite auto-increment schemas to Postgres serial types
  sql = sql.replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/gi, 'SERIAL PRIMARY KEY');
  sql = sql.replace(/\bDATETIME DEFAULT CURRENT_TIMESTAMP\b/gi, 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP');
  sql = sql.replace(/\bREAL\b/gi, 'DOUBLE PRECISION');

  // Translate SQLite scalar MAX(0, x) to PostgreSQL GREATEST(0, x)
  sql = sql.replace(/\bMAX\s*\(\s*0\s*,\s*/gi, 'GREATEST(0, ');

  // Translate INSERT OR REPLACE INTO settings ...
  sql = sql.replace(/INSERT OR REPLACE INTO settings\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi, 
    'INSERT INTO settings ($1) VALUES ($2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value');

  // Translate INSERT OR REPLACE INTO product_size_inventory ...
  sql = sql.replace(/INSERT OR REPLACE INTO product_size_inventory\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi, 
    'INSERT INTO product_size_inventory ($1) VALUES ($2) ON CONFLICT (product_id, size) DO UPDATE SET stock = EXCLUDED.stock');

  // Translate INSERT OR IGNORE INTO ...
  sql = sql.replace(/INSERT OR IGNORE INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi,
    'INSERT INTO $1 ($2) VALUES ($3) ON CONFLICT DO NOTHING');

  // Translate SQLite ? placeholders to PostgreSQL $1, $2, etc.
  let paramIndex = 1;
  sql = sql.replace(/\?/g, () => `$${paramIndex++}`);

  return sql;
}

// Helper to write SQLite database to disk
function saveDatabase() {
  if (isPostgres || !db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('Error saving database to file:', err);
  }
}

// Helper to query all records as an array of objects
async function all(query, params = [], userContext = null) {
  if (isPostgres) {
    const pgQuery = translateSql(query);
    const client = await pgPool.connect();
    try {
      if (userContext && userContext.id) {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userContext.id]);
        await client.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [userContext.role || 'authenticated']);
        const res = await client.query(pgQuery, params);
        await client.query('COMMIT');
        return res.rows;
      } else {
        const res = await client.query(pgQuery, params);
        return res.rows;
      }
    } catch (err) {
      if (userContext && userContext.id) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      client.release();
    }
  } else {
    if (!db) throw new Error('Database not initialized');
    const sqliteQuery = translateSql(query);
    const stmt = db.prepare(sqliteQuery);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }
}

// Helper to query a single record as an object
async function get(query, params = [], userContext = null) {
  if (isPostgres) {
    const pgQuery = translateSql(query);
    const client = await pgPool.connect();
    try {
      if (userContext && userContext.id) {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userContext.id]);
        await client.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [userContext.role || 'authenticated']);
        const res = await client.query(pgQuery, params);
        await client.query('COMMIT');
        return res.rows[0] || null;
      } else {
        const res = await client.query(pgQuery, params);
        return res.rows[0] || null;
      }
    } catch (err) {
      if (userContext && userContext.id) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      client.release();
    }
  } else {
    if (!db) throw new Error('Database not initialized');
    const sqliteQuery = translateSql(query);
    const stmt = db.prepare(sqliteQuery);
    stmt.bind(params);
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result;
  }
}

// Helper to run query (INSERT/UPDATE/DELETE) and save
async function run(query, params = [], userContext = null) {
  if (isPostgres) {
    const pgQuery = translateSql(query);
    const client = await pgPool.connect();
    try {
      if (userContext && userContext.id) {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userContext.id]);
        await client.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [userContext.role || 'authenticated']);
        const res = await client.query(pgQuery, params);
        await client.query('COMMIT');
        return res;
      } else {
        const res = await client.query(pgQuery, params);
        return res;
      }
    } catch (err) {
      if (userContext && userContext.id) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      client.release();
    }
  } else {
    if (!db) throw new Error('Database not initialized');
    const sqliteQuery = translateSql(query);
    db.run(sqliteQuery, params);
    saveDatabase();
  }
}

// Check if a column exists in a table
async function columnExists(table, column) {
  try {
    if (isPostgres) {
      const row = await get(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_schema='public' AND table_name = ? AND column_name = ?`,
        [table, column]
      );
      return !!row;
    } else {
      const cols = await all(`PRAGMA table_info(${table})`);
      return cols.some(c => c.name === column);
    }
  } catch (e) {
    return false;
  }
}

// Check if a table exists
async function tableExists(tableName) {
  if (isPostgres) {
    const row = await get(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema='public' AND table_name = ?`,
      [tableName]
    );
    return !!row;
  } else {
    const row = await get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tableName]);
    return !!row;
  }
}

async function initDb() {
  if (isPostgres) {
    console.log('Connecting to Supabase Postgres database...');
    try {
      const hasUsers = await tableExists('users');
      if (!hasUsers) {
        console.log('Supabase tables missing. Creating schema and seeding default data...');
        await createAllTables();
        await seedData();
      } else {
        console.log('Supabase tables exist. Running migrations...');
        await runMigrations();
        
        // Check if products table is empty and seed if needed
        const productCount = await get('SELECT COUNT(*) as count FROM products');
        if (!productCount || productCount.count === 0) {
          console.log('Products table is empty. Seeding default products...');
          await seedData();
        }
      }
      console.log('Supabase database initialized successfully.');
      return;
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        console.error('CRITICAL: Supabase Postgres database initialization failed in production!', err);
        throw err;
      }
      console.warn('Error initializing Supabase Postgres database, falling back to local SQLite:', err.message);
      isPostgres = false;
      module.exports.isPostgres = false;
    }
  }

  SQL = await initSqlJs();
  
  if (fs.existsSync(dbPath)) {
    console.log('Loading SQLite database from file...');
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      console.log('SQLite Database loaded successfully.');
      
      // Run migrations on existing databases
      await runMigrations();
      
      // Ensure admin email/password
      const adminHash = bcrypt.hashSync('k.nithwik@2030098', 10);
      db.run("UPDATE users SET email = 'k.nithwik59@gmail.com', password_hash = ?, role = 'owner' WHERE username = 'admin'", [adminHash]);

      // Ensure customer test user exists
      const customerHash = bcrypt.hashSync('password', 10);
      const customerStmt = db.prepare("SELECT id FROM users WHERE username = 'customer'");
      let hasCustomer = false;
      if (customerStmt.step()) {
        hasCustomer = true;
      }
      customerStmt.free();

      if (!hasCustomer) {
        db.run("INSERT INTO users (id, username, email, password_hash, role) VALUES ('2', 'customer', 'customer@magmazoes.com', ?, 'customer')", [customerHash]);
      } else {
        db.run("UPDATE users SET email = 'customer@magmazoes.com', password_hash = ?, role = 'customer' WHERE username = 'customer'", [customerHash]);
      }

      // Ensure default products are enabled for search audit test
      db.run("UPDATE products SET enabled = 1");

      saveDatabase();
      return;
    } catch (err) {
      console.error('Error loading SQLite database file, creating new database instead.', err);
    }
  }

  console.log('Creating new SQLite database in-memory...');
  db = new SQL.Database();
  
  await createAllTables();
  await seedData();

  console.log('SQLite Database schema and seed records successfully created.');
  saveDatabase();
}

async function runMigrations() {
  console.log('Running database migrations...');

  // Create store_sections table (separate from categories)
  if (!(await tableExists('store_sections'))) {
    await run(`
      CREATE TABLE IF NOT EXISTS store_sections (
        id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL
      );
    `);
    // Seed store sections
    const sections = [
      { name: 'New Release', slug: 'new-release' },
      { name: 'Limited Edition', slug: 'limited-edition' },
      { name: 'Collection', slug: 'collection' },
      { name: 'Resale', slug: 'resale' }
    ];
    for (const s of sections) {
      await run('INSERT OR IGNORE INTO store_sections (name, slug) VALUES (?, ?)', [s.name, s.slug]);
    }
    console.log('Migration: store_sections table created and seeded.');
  }

  // Ensure categories table exists with proper product categories
  if (!(await tableExists('categories'))) {
    await run(`
      CREATE TABLE IF NOT EXISTS categories (
        id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL
      );
    `);
  }

  // Check if we need to migrate categories from sections to product types
  const existingCats = await all('SELECT * FROM categories');
  const sectionSlugs = ['new-release', 'limited-edition', 'collection', 'resale'];
  const hasOnlySectionCats = existingCats.length > 0 && existingCats.every(c => sectionSlugs.includes(c.slug));
  
  if (hasOnlySectionCats || existingCats.length === 0) {
    if (await columnExists('products', 'category_id')) {
      await run('UPDATE products SET category_id = NULL');
    }
    await run('DELETE FROM categories');
    const productCategories = [
      { name: 'Dunk', slug: 'dunk' },
      { name: 'Sneaker', slug: 'sneaker' },
      { name: 'Running', slug: 'running' },
      { name: 'Basketball', slug: 'basketball' },
      { name: 'Lifestyle', slug: 'lifestyle' }
    ];
    for (const cat of productCategories) {
      await run('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)', [cat.name, cat.slug]);
    }
    console.log('Migration: categories updated to product type categories.');
  }

  // Add section_id column to products if missing
  if ((await tableExists('products')) && !(await columnExists('products', 'section_id'))) {
    await run('ALTER TABLE products ADD COLUMN section_id INTEGER REFERENCES store_sections(id)');
    console.log('Migration: section_id column added to products.');
    
    const sections = await all('SELECT * FROM store_sections');
    const sectionMap = {};
    sections.forEach(s => { sectionMap[s.slug] = s.id; });
    
    const oldToSection = {
      1: sectionMap['new-release'],
      2: sectionMap['limited-edition'],
      3: sectionMap['collection'],
      4: sectionMap['resale']
    };
    for (const [oldId, newSectionId] of Object.entries(oldToSection)) {
      if (newSectionId) {
        await run('UPDATE products SET section_id = ? WHERE category_id = ?', [newSectionId, Number(oldId)]);
      }
    }
    await run('UPDATE products SET category_id = NULL');
    const sneakerCat = await get("SELECT id FROM categories WHERE slug = 'sneaker'");
    if (sneakerCat) {
      await run('UPDATE products SET category_id = ?', [sneakerCat.id]);
    }
  }

  // Add payment_method column to orders
  if ((await tableExists('orders')) && !(await columnExists('orders', 'payment_method'))) {
    await run("ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'Online Payment'");
    console.log('Migration: payment_method column added to orders.');
  }

  // Add courier_name column to orders
  if ((await tableExists('orders')) && !(await columnExists('orders', 'courier_name'))) {
    await run("ALTER TABLE orders ADD COLUMN courier_name TEXT DEFAULT 'Delhivery Logistics'");
    console.log('Migration: courier_name column added to orders.');
  }

  // Add invoice_number column to orders
  if ((await tableExists('orders')) && !(await columnExists('orders', 'invoice_number'))) {
    await run('ALTER TABLE orders ADD COLUMN invoice_number TEXT');
    console.log('Migration: invoice_number column added to orders.');
    const existingOrders = await all('SELECT id, created_at FROM orders WHERE invoice_number IS NULL');
    for (const o of existingOrders) {
      const date = new Date(o.created_at || Date.now());
      const ym = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
      const num = String(o.id).padStart(5, '0');
      await run('UPDATE orders SET invoice_number = ? WHERE id = ?', [`MG-INV-${ym}-${num}`, o.id]);
    }
  }

  // Add shipping_notes column to orders
  if ((await tableExists('orders')) && !(await columnExists('orders', 'shipping_notes'))) {
    await run('ALTER TABLE orders ADD COLUMN shipping_notes TEXT');
    console.log('Migration: shipping_notes column added to orders.');
  }

  // Create product_images table
  if (!(await tableExists('product_images'))) {
    await run(`
      CREATE TABLE IF NOT EXISTS product_images (
        id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        is_primary INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Migration: product_images table created.');
    if ((await tableExists('products')) && (await columnExists('products', 'image_url'))) {
      const prods = await all('SELECT id, image_url FROM products WHERE image_url IS NOT NULL AND image_url != ""');
      for (const p of prods) {
        await run(
          'INSERT INTO product_images (product_id, url, sort_order, is_primary) VALUES (?, ?, 0, 1)',
          [p.id, p.image_url]
        );
      }
      console.log(`Migration: ${prods.length} product images migrated to product_images table.`);
    }
  }

  // Create product_size_inventory table
  if (!(await tableExists('product_size_inventory'))) {
    await run(`
      CREATE TABLE IF NOT EXISTS product_size_inventory (
        id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        size TEXT NOT NULL,
        stock INTEGER DEFAULT 0,
        UNIQUE(product_id, size)
      );
    `);
    console.log('Migration: product_size_inventory table created.');
    if (await tableExists('products')) {
      const prods = await all('SELECT id, sizes, stock FROM products');
      for (const p of prods) {
        let sizes = [];
        try { sizes = JSON.parse(p.sizes || '[]'); } catch(e) {}
        const totalStock = p.stock || 0;
        if (sizes.length > 0) {
          const baseStock = Math.floor(totalStock / sizes.length);
          for (let idx = 0; idx < sizes.length; idx++) {
            const sz = sizes[idx];
            let sizeStock = baseStock;
            if (idx === sizes.length - 1 && totalStock < sizes.length) {
              sizeStock = 0;
            } else if (idx === 0 && totalStock > 0) {
              sizeStock = Math.max(baseStock, 1);
            }
            await run(
              'INSERT OR IGNORE INTO product_size_inventory (product_id, size, stock) VALUES (?, ?, ?)',
              [p.id, String(sz), sizeStock]
            );
          }
        }
      }
      console.log('Migration: per-size inventory populated from existing products.');
    }
  }

  // Ensure notification_history table exists
  if (!(await tableExists('notification_history'))) {
    await run(`
      CREATE TABLE IF NOT EXISTS notification_history (
        id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        user_id ${isPostgres ? 'UUID' : 'INTEGER'} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        event TEXT NOT NULL,
        recipient TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Migration: notification_history table created.');
  }

  // Ensure audit_logs table exists
  if (!(await tableExists('audit_logs'))) {
    await run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
        user_id ${isPostgres ? 'UUID' : 'INTEGER'} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Migration: audit_logs table created.');
  }

  // Create indexes for performance optimization
  await run(`CREATE INDEX IF NOT EXISTS idx_products_enabled ON products(enabled)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_products_section ON products(section_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_size_inventory_product ON product_size_inventory(product_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_cart_user ON cart(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`);

  console.log('All migrations completed successfully.');
}

async function createAllTables() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id ${isPostgres ? 'UUID' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT DEFAULT 'customer',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS store_sections (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      brand TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      section_id INTEGER REFERENCES store_sections(id) ON DELETE SET NULL,
      sku TEXT UNIQUE,
      price DOUBLE PRECISION NOT NULL,
      description TEXT,
      image_url TEXT,
      sizes TEXT,
      colors TEXT,
      stock INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      is_new_arrival INTEGER DEFAULT 0,
      is_limited_edition INTEGER DEFAULT 0,
      is_resale INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS product_size_inventory (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size TEXT NOT NULL,
      stock INTEGER DEFAULT 0,
      UNIQUE(product_id, size)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS product_images (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_primary INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS cart (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      user_id ${isPostgres ? 'UUID' : 'INTEGER'} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS wishlist (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      user_id ${isPostgres ? 'UUID' : 'INTEGER'} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      user_id ${isPostgres ? 'UUID' : 'INTEGER'} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'Pending',
      subtotal DOUBLE PRECISION NOT NULL,
      shipping DOUBLE PRECISION NOT NULL,
      tax DOUBLE PRECISION NOT NULL,
      total DOUBLE PRECISION NOT NULL,
      promo_code TEXT,
      shipping_address TEXT,
      payment_method TEXT DEFAULT 'Online Payment',
      invoice_number TEXT,
      tracking_number TEXT,
      courier_name TEXT DEFAULT 'Delhivery Logistics',
      shipping_notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price DOUBLE PRECISION NOT NULL
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS addresses (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      user_id ${isPostgres ? 'UUID' : 'INTEGER'} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address_line1 TEXT NOT NULL,
      address_line2 TEXT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      is_default INTEGER DEFAULT 0
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id ${isPostgres ? 'UUID' : 'INTEGER'} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS coupons (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      code TEXT UNIQUE NOT NULL,
      discount_percent DOUBLE PRECISION NOT NULL,
      active INTEGER DEFAULT 1
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS notification_history (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      user_id ${isPostgres ? 'UUID' : 'INTEGER'} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      event TEXT NOT NULL,
      recipient TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
      user_id ${isPostgres ? 'UUID' : 'INTEGER'} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function seedData() {
  // Seed Store Sections (ignore if already exists)
  const sections = [
    { name: 'New Release', slug: 'new-release' },
    { name: 'Limited Edition', slug: 'limited-edition' },
    { name: 'Collection', slug: 'collection' },
    { name: 'Resale', slug: 'resale' }
  ];
  for (const s of sections) {
    await run('INSERT OR IGNORE INTO store_sections (name, slug) VALUES (?, ?)', [s.name, s.slug]);
  }

  // Seed Product Categories (ignore if already exists)
  const categories = [
    { name: 'Dunk', slug: 'dunk' },
    { name: 'Sneaker', slug: 'sneaker' },
    { name: 'Running', slug: 'running' },
    { name: 'Basketball', slug: 'basketball' },
    { name: 'Lifestyle', slug: 'lifestyle' }
  ];
  for (const cat of categories) {
    await run('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)', [cat.name, cat.slug]);
  }

  // Seed default admin and customer
  const adminHash = bcrypt.hashSync('k.nithwik@2030098', 10);
  const customerHash = bcrypt.hashSync('password', 10);

  // In Postgres, Supabase Auth manages users, so we seed local users for SQLite, or if Postgres we seed with a dummy UUID
  const adminId = isPostgres ? '00000000-0000-0000-0000-000000000000' : '1';
  const customerId = isPostgres ? '11111111-1111-1111-1111-111111111111' : '2';

  await run(
    `INSERT OR IGNORE INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
    [adminId, 'admin', 'k.nithwik59@gmail.com', adminHash, 'owner']
  );
  await run(
    `INSERT OR IGNORE INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
    [customerId, 'customer', 'customer@magmazoes.com', customerHash, 'customer']
  );

  // Seed system settings (use REPLACE to update if exists)
  await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_name', 'MAGMAZOES')");
  await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('currency', '₹')");
  await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('tax_rate', '0.18')"); // 18% GST in India
  await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('shipping_cost', '0')"); // Free shipping
  await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_address', '204, Hype Tower, Bandra West, Mumbai - 400050, Maharashtra, India')");
  await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_gstin', '27AABCM1234A1Z5')");
  await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_phone', '+91 98765 43210')");
  await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_email', 'support@magmazoes.com')");

  // Seed Coupons (ignore if already exists)
  await run("INSERT OR IGNORE INTO coupons (code, discount_percent, active) VALUES ('MAGMA10', 10.0, 1)");
  await run("INSERT OR IGNORE INTO coupons (code, discount_percent, active) VALUES ('SOLAR20', 20.0, 1)");

  // Get section and category IDs
  const secNewRelease = await get("SELECT id FROM store_sections WHERE slug = 'new-release'");
  const secLimited = await get("SELECT id FROM store_sections WHERE slug = 'limited-edition'");
  const secCollection = await get("SELECT id FROM store_sections WHERE slug = 'collection'");
  const secResale = await get("SELECT id FROM store_sections WHERE slug = 'resale'");

  const catDunk = await get("SELECT id FROM categories WHERE slug = 'dunk'");
  const catSneaker = await get("SELECT id FROM categories WHERE slug = 'sneaker'");
  const catLifestyle = await get("SELECT id FROM categories WHERE slug = 'lifestyle'");

  const products = [
    {
      name: 'MAGMA X-1 CHUNKY',
      slug: 'magma-x1-chunky',
      brand: 'NIKE',
      category_id: catDunk ? catDunk.id : 1,
      section_id: secNewRelease ? secNewRelease.id : 1,
      sku: 'MR-X1-CH',
      price: 23500.00,
      description: 'High-end limited edition chunky sneaker engineering the solar flare aesthetic. Features robust cushioning and structured layering.',
      image_url: 'https://lh3.googleusercontent.com/aida/ADBb0uiWJD_0kbfO6EWtyuxJvdTFnoNB0wJd51TL0AFSVUjYTBdiLCPl8U5QeeYsSJ4DtIuN0e2KLuW9QTuH6MPtbPH4jWSFC4Q1T--CPHFkMz1pA1k6P_oy6I7TgVxe_GBzx-Wiu7oBzGU-Ts3tMc3U7nPKdBU5OT5mhGxvOKTXwNfP2CzZLVY3oY5L-EC2fvhjszck2qgevua4eUOSEUSFuaX9SIG8RnGF7wWK3YodCJNBh2g_SsyXCEwEpMDV',
      sizes: ['8', '9', '9.5', '10', '10.5', '11', '13'],
      sizeStocks: { '8': 5, '9': 3, '9.5': 2, '10': 4, '10.5': 1, '11': 3, '13': 0 },
      colors: ['Orange', 'Black', 'White'],
      stock: 18,
      is_featured: 1, is_new_arrival: 1, is_limited_edition: 0, is_resale: 0
    },
    {
      name: 'FLARE HI-TOP',
      slug: 'flare-hi-top',
      brand: 'ADIDAS',
      category_id: catSneaker ? catSneaker.id : 2,
      section_id: secLimited ? secLimited.id : 2,
      sku: 'FL-HI-TP',
      price: 26000.00,
      description: 'Stunning high-top silhouette in luxury mesh with orange accents. Structured ankle wraps and performance grade build.',
      image_url: 'https://lh3.googleusercontent.com/aida/ADBb0ug16mRy-lzZducTIwZ7iynG69KAUsJVYEeDJ7wOhmpFpbt4KBU1doB0McXaukBeX4bOyiM8pv6VpZfi-hyZLDFxJqrAFdxNoFmkbHUTwzBy9rmFi_6F91SIX1avWC5h-zwPpIHWRADK3AN64Ro2edL6NSAhZC22q-P5auUSwrCmlwrM2Q9upzlUX8xO9no5asQnUQHyb5DT0g0jxJ3vcT1wv5ui_mAyxQENRGhuWUqfSVveK6i6LOyP9U8k',
      sizes: ['7', '8', '9', '9.5', '10', '10.5'],
      sizeStocks: { '7': 5, '8': 3, '9': 0, '9.5': 2, '10': 1, '10.5': 0 },
      colors: ['Orange', 'White'],
      stock: 11,
      is_featured: 1, is_new_arrival: 0, is_limited_edition: 1, is_resale: 0
    },
    {
      name: 'ORANGE PULSE',
      slug: 'orange-pulse',
      brand: 'ASICS',
      category_id: catLifestyle ? catLifestyle.id : 5,
      section_id: secCollection ? secCollection.id : 3,
      sku: 'OR-PL-AS',
      price: 16000.00,
      description: 'Vibrant orange details and architectural carbon fiber frames. Ideal for daily streetwear statement.',
      image_url: 'https://lh3.googleusercontent.com/aida/ADBb0ugCTclrVLMJyQT07qG_jxTqmj2sugz98IXHS86IXAspgTbR5B1IEzP2W-D-ApKYXfQh4kTSEbZXULq7ZBTfmtYe7-ysgAU6mck9I7CoYbZBCA3IieK9jcYEznxKJk1Myjg8zHrMDUDbFPMH0KXJcK9Y2IYuj1l1R4NRNnkGEgDMOq5_UdRq6x4IxWQGagIXIu1gIxsf8rulk24YiAB2LzoiwLG01F-nzbEQChivEYxUmm6GyiUxKcodACOQ',
      sizes: ['8', '9', '10', '11'],
      sizeStocks: { '8': 4, '9': 3, '10': 2, '11': 1 },
      colors: ['Orange'],
      stock: 10,
      is_featured: 1, is_new_arrival: 0, is_limited_edition: 0, is_resale: 0
    },
    {
      name: 'LUMINA SOLAR',
      slug: 'lumina-solar',
      brand: 'LUMINA',
      category_id: catSneaker ? catSneaker.id : 2,
      section_id: secLimited ? secLimited.id : 2,
      sku: 'LM-SL-ED',
      price: 95000.00,
      description: 'Zurich laboratory exclusive. Only 500 pairs worldwide. Features solar-sole kinetic technology that responds dynamically.',
      image_url: 'https://lh3.googleusercontent.com/aida/ADBb0ugCTclrVLMJyQT07qG_jxTqmj2sugz98IXHS86IXAspgTbR5B1IEzP2W-D-ApKYXfQh4kTSEbZXULq7ZBTfmtYe7-ysgAU6mck9I7CoYbZBCA3IieK9jcYEznxKJk1Myjg8zHrMDUDbFPMH0KXJcK9Y2IYuj1l1R4NRNnkGEgDMOq5_UdRq6x4IxWQGagIXIu1gIxsf8rulk24YiAB2LzoiwLG01F-nzbEQChivEYxUmm6GyiUxKcodACOQ',
      sizes: ['8', '9', '9.5', '10', '10.5', '11', '13'],
      sizeStocks: { '8': 1, '9': 1, '9.5': 0, '10': 1, '10.5': 0, '11': 0, '13': 0 },
      colors: ['Orange', 'Black', 'White'],
      stock: 3,
      is_featured: 0, is_new_arrival: 1, is_limited_edition: 1, is_resale: 0
    },
    {
      name: 'LUMINA LUNAR',
      slug: 'lumina-lunar',
      brand: 'LUMINA',
      category_id: catLifestyle ? catLifestyle.id : 5,
      section_id: secCollection ? secCollection.id : 3,
      sku: 'LM-LN-MC',
      price: 85000.00,
      description: 'Lunar series sneaker in deep midnight blue and cold silver details. Extremely elegant in low lights.',
      image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDQw2upNVooEtdd-Fwyy_C3bYhukOC7DhmAIQE9Z3z9Li8yAZVSIvd7eVfY6ICqYcxq7lZyQd8yZWclz1jDqo0_60Z7NM_cXMY6mGZU3kMEOnn0gOahI2MRfxVe6Zv-Kw5JKaKCH2pgwRqHXXJKz2_8qiApa7Vl-dd2WKESIvW_OSjPRRid8WISjqTh02MR4oNRYbjtCbTSwAhlAaGr7M3BUKv-pwDmPdNaDV-jMe4m2Jm08lgdG-d3aMfFONb5Sd9RrKh2hTIJtgb7',
      sizes: ['8', '9', '10', '11'],
      sizeStocks: { '8': 3, '9': 4, '10': 2, '11': 1 },
      colors: ['Black', 'White'],
      stock: 10,
      is_featured: 0, is_new_arrival: 0, is_limited_edition: 0, is_resale: 0
    },
    {
      name: 'IGNIS PROTO',
      slug: 'ignis-proto',
      brand: 'CONCEPT',
      category_id: catSneaker ? catSneaker.id : 2,
      section_id: secResale ? secResale.id : 4,
      sku: 'IG-PR-BK',
      price: 115000.00,
      description: 'Concept prototype with exposed wiring and matte onyx textures. Collectible condition.',
      image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA5ZRiTzPCmcHDV5cQZAwLgdYBN6yr8Kp4CJeD5tH1rxH80gziZx1luxJHhCU9CiaCUOLnxcAInmWVwF7Fdx6Mwr-wwSERvayim4uTm9_kKMQMaVQlIiJzE72MUuNuvY4-wVfVKGMjQicGcWIcDh2l5nErOGpZzEBSMSZ8CsoV-qDbP0a9eFjMWF8mtB98go-sBr9rYps2dwMWXMWVYROLasQJwhQUnaMIrO-ES30WtSjvPquSyxLT0ngRaE2zWenRK5Ym0m_ueszPW',
      sizes: ['8', '9', '10'],
      sizeStocks: { '8': 1, '9': 0, '10': 1 },
      colors: ['Black', 'Orange'],
      stock: 2,
      is_featured: 0, is_new_arrival: 0, is_limited_edition: 0, is_resale: 1
    },
    {
      name: 'APEX WHITE',
      slug: 'apex-white',
      brand: 'MINIMALIST',
      category_id: catLifestyle ? catLifestyle.id : 5,
      section_id: secCollection ? secCollection.id : 3,
      sku: 'AP-WT-LM',
      price: 65000.00,
      description: 'All white low-top streetwear luxury shoe with glass panels. Pure minimalism at its peak.',
      image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD5DW2lV9kDFLJjQck2XevGckmWZ9x3ZcMmpvcpcommlL7V_YaOocVpzA2VABXQULSNN_YdeS7sRRP5A6LqFzZdluLgktPsM8Y2C4-mt9cX8bLYGxkQ0Tapn9EiAP2v87NrE0E4L7ODuwtg0JbDtvMqQAtn9uG6cVuWzCM7tinDlPiOREelrFZ1TCkCyG3wjbyhMCLB4Vein9eLNzG0HE-uFkuuH-RmxPZ3iyON5KzWbGw2U-bH6vDsAQiA1W4Hy8SW13-Q0l5GUdq8',
      sizes: ['8', '9', '10', '11', '12'],
      sizeStocks: { '8': 3, '9': 2, '10': 4, '11': 2, '12': 1 },
      colors: ['White'],
      stock: 12,
      is_featured: 0, is_new_arrival: 0, is_limited_edition: 0, is_resale: 0
    }
  ];

  for (const prod of products) {
    // Check if product already exists
    const existing = await get('SELECT id FROM products WHERE slug = ?', [prod.slug]);
    if (existing) {
      console.log(`Product "${prod.name}" already exists, skipping...`);
      continue;
    }

    await run(
      `INSERT INTO products (name, slug, brand, category_id, section_id, sku, price, description, image_url, sizes, colors, stock, is_featured, is_new_arrival, is_limited_edition, is_resale)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prod.name, prod.slug, prod.brand, prod.category_id, prod.section_id,
        prod.sku, prod.price, prod.description, prod.image_url,
        JSON.stringify(prod.sizes), JSON.stringify(prod.colors), prod.stock,
        prod.is_featured, prod.is_new_arrival, prod.is_limited_edition, prod.is_resale
      ]
    );

    const newProd = await get('SELECT id FROM products WHERE slug = ?', [prod.slug]);
    if (newProd) {
      // Insert product_images (ignore if already exists)
      await run(
        'INSERT OR IGNORE INTO product_images (product_id, url, sort_order, is_primary) VALUES (?, ?, 0, 1)',
        [newProd.id, prod.image_url]
      );

      // Insert per-size inventory (ignore if already exists)
      for (const sz of prod.sizes) {
        const sizeStock = prod.sizeStocks[sz] !== undefined ? prod.sizeStocks[sz] : Math.max(0, Math.floor(prod.stock / prod.sizes.length));
        await run(
          'INSERT OR IGNORE INTO product_size_inventory (product_id, size, stock) VALUES (?, ?, ?)',
          [newProd.id, String(sz), sizeStock]
        );
      }
    }
  }
}

module.exports = {
  initDb,
  all,
  get,
  run,
  saveDatabase,
  columnExists,
  tableExists,
  isPostgres
};
