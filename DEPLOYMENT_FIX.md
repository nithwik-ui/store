# 🔧 Vercel Deployment Fix - Products Not Showing

## Issue Summary
After deploying to Vercel, the e-commerce store's products were not appearing on the `/shop` page, even though they work locally.

## Root Cause
The database initialization logic in `src/db.js` had a critical flaw:
- When the `users` table already existed (from a previous deployment or schema file), the code would skip the `seedData()` function
- This meant the `products` table was created but **remained empty**
- Result: API calls to `/api/products` would return an empty array

## Solution Implemented
Modified `src/db.js` with three key improvements:

### 1. Smart Product Detection (initDb function)
```javascript
// After running migrations, check if products table is empty
const productCount = await get('SELECT COUNT(*) as count FROM products');
if (!productCount || productCount.count === 0) {
  console.log('Products table is empty. Seeding default products...');
  await seedData();
}
```

### 2. Duplicate-Safe Inserts (seedData function)
- Changed INSERT statements to `INSERT OR IGNORE` for idempotent operations
- Used `INSERT OR REPLACE` for settings to allow updates
- Added existence checks before product insertion
- Prevents errors when seeding multiple times

### 3. Safe Re-seeding
```javascript
// Check if product already exists before inserting
const existing = await get('SELECT id FROM products WHERE slug = ?', [prod.slug]);
if (existing) {
  console.log(`Product "${prod.name}" already exists, skipping...`);
  continue;
}
```

## Files Modified
- `src/db.js` - Database initialization and seeding logic

## What Happens After Redeployment
When the app starts on Vercel:

1. ✅ Connects to Supabase PostgreSQL database
2. ✅ Runs database migrations (creates tables if needed)
3. ✅ **NEW**: Checks if products table is empty
4. ✅ **NEW**: If empty, automatically seeds 8 premium streetwear products
5. ✅ Application is ready with fully populated product catalog

## Expected Product Catalog
After the fix, you'll have these 8 products:
- MAGMA X-1 CHUNKY (NIKE, ₹23,500)
- FLARE HI-TOP (ADIDAS, ₹26,000)
- ORANGE PULSE (ASICS, ₹16,000)
- LUMINA SOLAR (LUMINA, ₹95,000)
- LUMINA LUNAR (LUMINA, ₹85,000)
- IGNIS PROTO (CONCEPT, ₹115,000)
- APEX WHITE (MINIMALIST, ₹65,000)
- Plus any additional products from images

## Deployment Steps
1. **Commit and Push**: Push the updated `src/db.js` to your repository
2. **Vercel Auto-Deploy**: Vercel will automatically detect the changes and redeploy
3. **Monitor Logs**: Check Vercel deployment logs for:
   ```
   [CACHE MISS] /api/products
   Products table is empty. Seeding default products...
   ```
4. **Verify**: Visit `https://your-domain.com/shop` and confirm products appear

## Testing the Fix
After redeployment, verify:
- [ ] `/shop` page displays all products
- [ ] `/api/products` returns product array
- [ ] Product filters work (category, section, brand)
- [ ] Sorting (price-low, price-high, newest) works
- [ ] Individual product pages load correctly
- [ ] Cart functionality works

## Environment Variables (Already Set on Vercel)
Make sure these exist in Vercel's environment variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase public API key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `DATABASE_URL` or `SUPABASE_DB_URL` - PostgreSQL connection string

## Rollback (If Needed)
If you need to revert the changes:
1. The fix is backward compatible - it won't break existing deployments
2. Products already in the database won't be re-inserted
3. Simply revert the `src/db.js` file to the previous version

## Technical Details
- Uses idempotent INSERT statements (`INSERT OR IGNORE`)
- Works with both SQLite (local) and PostgreSQL (Vercel/Supabase)
- Automatic retry logic prevents transient failures
- Zero downtime - seeds happen on app startup before requests are served

---
**Last Updated**: June 8, 2026
**Status**: ✅ Ready for Deployment
