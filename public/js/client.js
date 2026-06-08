// MAGMAZOES - Client Side Controller JavaScript
document.addEventListener('DOMContentLoaded', () => {
  initGlobalHeaderAndFooter();
  
  // Detect current page and route to specific initializer
  const path = window.location.pathname;
  if (path === '/' || path === '/index.html') {
    initHomePage();
  } else if (path === '/shop' || path === '/collection' || path === '/new-arrivals' || path === '/limited-edition' || path === '/resale') {
    initShopPage();
  } else if (path.startsWith('/product/')) {
    initProductPage();
  } else if (path === '/cart') {
    initCartPage();
  } else if (path === '/login') {
    initLoginPage();
  } else if (path === '/signup') {
    initSignupPage();
  } else if (path === '/account') {
    initAccountPage();
  } else if (path.startsWith('/admin')) {
    initAdminPage();
  }
});

// Helper: Format Currency to Indian Rupee (₹)
function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(amount).replace('INR', '₹').trim();
}

// Helper: Escape HTML to prevent XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Debounce Helper
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Client-side Memory Cache Layer
const apiCache = new Map();
function fetchCached(url, cacheTimeMs = 30000) {
  const now = Date.now();
  if (apiCache.has(url)) {
    const cached = apiCache.get(url);
    if (now - cached.timestamp < cacheTimeMs) {
      return Promise.resolve(JSON.parse(JSON.stringify(cached.data)));
    }
  }
  return fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    })
    .then(data => {
      apiCache.set(url, { timestamp: Date.now(), data });
      return JSON.parse(JSON.stringify(data));
    });
}

// Shared promise for current user session
let currentUserPromise = null;
function getCurrentUser(forceRefresh = false) {
  if (forceRefresh || !currentUserPromise) {
    currentUserPromise = fetch('/api/me')
      .then(res => {
        if (!res.ok) throw new Error('Not logged in');
        return res.json();
      })
      .catch(err => {
        currentUserPromise = null;
        return { loggedIn: false };
      });
  }
  return currentUserPromise;
}


// Inject Toast Styles
(() => {
  const style = document.createElement('style');
  style.innerHTML = `
    .toast-container {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 400px;
      width: calc(100% - 48px);
      pointer-events: none;
    }
    .toast-card {
      background: white;
      border: 1px solid #c4c7c8;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
      transform: translateX(120%);
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
      opacity: 0;
      pointer-events: auto;
    }
    .toast-card.show {
      transform: translateX(0);
      opacity: 1;
    }
    .toast-card.success { border-left: 4px solid #2e6a41; }
    .toast-card.error { border-left: 4px solid #ba1a1a; }
    .toast-card.warning { border-left: 4px solid #fea619; }
    .toast-card.info { border-left: 4px solid #855300; }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    .animate-fade-in {
      animation: fadeIn 0.25s ease-out forwards;
    }
  `;
  document.head.appendChild(style);
})();

// Global Custom Toast System
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-card ${type}`;
  
  let icon = 'check_circle';
  let iconColor = 'text-tertiary';
  if (type === 'error') { icon = 'cancel'; iconColor = 'text-error'; }
  else if (type === 'warning') { icon = 'warning'; iconColor = 'text-secondary-container'; }
  else if (type === 'info') { icon = 'info'; iconColor = 'text-secondary'; }

  toast.innerHTML = `
    <span class="material-symbols-outlined ${iconColor} text-[24px]">${icon}</span>
    <div class="flex-1 font-body-md text-sm text-on-surface">${message}</div>
    <button class="material-symbols-outlined text-outline hover:text-on-surface text-[18px] close-btn">close</button>
  `;

  toast.querySelector('.close-btn').addEventListener('click', () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  });

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}

// Global Custom Confirm Modal
function showConfirm(title, message, onConfirm, onCancel) {
  let modal = document.getElementById('confirm-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'confirm-modal';
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
  modal.innerHTML = `
    <div class="bg-white p-8 max-w-md w-full border border-outline-variant shadow-2xl flex flex-col gap-6 relative animate-fade-in">
      <div>
        <h3 class="font-headline-md text-headline-md uppercase text-on-surface">${title}</h3>
        <p class="font-body-md text-on-surface-variant mt-2 text-sm">${message}</p>
      </div>
      <div class="flex gap-4">
        <button id="confirm-btn-yes" class="flex-grow bg-secondary text-white py-3 font-label-md text-sm uppercase hover:bg-secondary/90 transition-colors">
          Confirm
        </button>
        <button id="confirm-btn-no" class="flex-grow border border-outline-variant py-3 font-label-md text-sm uppercase hover:bg-surface-container-high transition-colors">
          Cancel
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('confirm-btn-yes').addEventListener('click', () => {
    modal.remove();
    if (onConfirm) onConfirm();
  });

  document.getElementById('confirm-btn-no').addEventListener('click', () => {
    modal.remove();
    if (onCancel) onCancel();
  });
}

// Global Sudo Password Verification Modal
function promptSudo(callback) {
  let modal = document.getElementById('sudo-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'sudo-modal';
  modal.className = 'fixed inset-0 z-[210] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
  modal.innerHTML = `
    <div class="bg-white p-8 max-w-md w-full border border-outline-variant shadow-2xl flex flex-col gap-6 relative animate-fade-in">
      <div>
        <h3 class="font-headline-md text-headline-md uppercase text-on-surface">Security Verification</h3>
        <p class="font-body-md text-on-surface-variant mt-2 text-sm">Please re-enter your password to authorize this action.</p>
      </div>
      <div>
        <input type="password" id="sudo-password" placeholder="Enter password" class="w-full border border-outline px-4 py-3 text-sm font-body-md focus:outline-none focus:border-secondary" autocomplete="current-password" required />
        <p id="sudo-error" class="text-error text-xs mt-2 hidden"></p>
      </div>
      <div class="flex gap-4">
        <button id="sudo-btn-confirm" class="flex-grow bg-secondary text-white py-3 font-label-md text-sm uppercase hover:bg-secondary/90 transition-colors">
          Confirm
        </button>
        <button id="sudo-btn-cancel" class="flex-grow border border-outline-variant py-3 font-label-md text-sm uppercase hover:bg-surface-container-high transition-colors">
          Cancel
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const pwdInput = document.getElementById('sudo-password');
  const errorEl = document.getElementById('sudo-error');
  const confirmBtn = document.getElementById('sudo-btn-confirm');
  
  pwdInput.focus();

  const handleConfirm = async () => {
    const password = pwdInput.value;
    if (!password) {
      errorEl.textContent = 'Password is required.';
      errorEl.classList.remove('hidden');
      return;
    }
    
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Verifying...';

    try {
      const res = await fetch('/api/admin/sudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        modal.remove();
        if (callback) callback();
      } else {
        const data = await res.json().catch(() => ({}));
        errorEl.textContent = data.error || 'Incorrect password.';
        errorEl.classList.remove('hidden');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm';
      }
    } catch (err) {
      console.error(err);
      errorEl.textContent = 'Server connection error.';
      errorEl.classList.remove('hidden');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm';
    }
  };

  confirmBtn.addEventListener('click', handleConfirm);
  pwdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  });

  document.getElementById('sudo-btn-cancel').addEventListener('click', () => {
    modal.remove();
  });
}

// Fallback Branded Image Data (SVG base64 placeholder)
const BRANDED_FALLBACK_IMAGE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="%23f2edeb"/><circle cx="300" cy="300" r="120" fill="%23ffddb8" opacity="0.4"/><path d="M220 280 L300 200 L380 280 L350 280 L350 400 L250 400 L250 280 Z" fill="%23855300"/><text x="50%22 y="85%22 font-family="Sora, sans-serif" font-size="28" font-weight="bold" fill="%231d1b1b" text-anchor="middle">MAGMAZOES</text><text x="50%22 y="91%22 font-family="JetBrains Mono, monospace" font-size="16" fill="%23747878" text-anchor="middle">ARCHIVE OUT OF BOUNDS</text></svg>';

// Global setup for nav link, currency replacement, and image error handling
function initGlobalHeaderAndFooter() {
  // 1. Redirect logo click to Home
  const logo = document.querySelector('.font-headline-md, nav span, nav div.font-headline-md');
  if (logo && (logo.textContent.trim() === 'MAGMAZOES' || logo.textContent.trim().includes('MAGMA'))) {
    logo.style.cursor = 'pointer';
    logo.addEventListener('click', () => {
      window.location.href = '/';
    });
  }

  // 2. Wire Header Navigation Links
  const navLinks = document.querySelectorAll('nav a, footer a');
  navLinks.forEach(link => {
    const text = link.textContent.trim().toLowerCase();
    if (text === 'hype' || text === 'best sellers') {
      link.href = '/shop';
    } else if (text === 'new arrivals') {
      link.href = '/shop?section=new-release';
    } else if (text === 'shop') {
      link.href = '/shop';
    } else if (text === 'collections') {
      link.href = '/collection';
    } else if (text === 'resale') {
      link.href = '/resale';
    } else if (text === 'terms of service' || text === 'privacy policy' || text === 'terms') {
      link.href = '/terms';
    }
  });

  // 3. Header Icons Routing & Dynamic Badge
  const favBtn = document.querySelector('[data-icon="favorite"], nav .material-symbols-outlined:nth-of-type(1)');
  const cartBtn = document.querySelector('[data-icon="shopping_bag"], nav .material-symbols-outlined:nth-of-type(2), nav relative');
  const userBtn = document.querySelector('[data-icon="person"], nav .material-symbols-outlined:nth-of-type(3)');

  if (favBtn) {
    favBtn.addEventListener('click', () => {
      window.location.href = '/account?tab=wishlist';
    });
  }
  if (cartBtn || document.querySelector('nav .material-symbols-outlined[data-icon="shopping_bag"]') || document.querySelector('nav relative, nav div.relative')) {
    const cartWrapper = cartBtn || document.querySelector('nav .material-symbols-outlined[data-icon="shopping_bag"]')?.parentElement || document.querySelector('nav div.relative');
    if (cartWrapper) {
      cartWrapper.style.cursor = 'pointer';
      cartWrapper.addEventListener('click', () => {
        window.location.href = '/cart';
      });
    }
  }
  if (userBtn) {
    userBtn.style.cursor = 'pointer';
    userBtn.addEventListener('click', () => {
      window.location.href = '/account';
    });
  }

  // Fetch logged in user to update icon or redirect
  getCurrentUser()
    .then(data => {
      if (data.loggedIn) {
        if (userBtn) userBtn.title = `Profile (${data.user.username})`;
        // If user is admin, add "Admin panel" link in header
        if (['owner', 'admin'].includes(data.user.role)) {
          const navContainer = document.querySelector('nav div.hidden.md\\:flex');
          if (navContainer && !document.querySelector('#admin-nav-link')) {
            const adminLink = document.createElement('a');
            adminLink.id = 'admin-nav-link';
            adminLink.className = 'text-error font-bold font-body-md hover:scale-105 transition-transform';
            adminLink.href = '/admin';
            adminLink.textContent = 'Command Center ⚡';
            navContainer.appendChild(adminLink);
          }
        }
      }
    });

  // Fetch cart to update the count badge in header
  updateCartBadge();

  // 4. Global Search inputs
  const searchInputs = document.querySelectorAll('input[placeholder*="Search"]');
  searchInputs.forEach(input => {
    // Real-time debounced search if on shop page
    const isShop = window.location.pathname === '/shop' || window.location.pathname === '/collection' || window.location.pathname === '/new-arrivals' || window.location.pathname === '/limited-edition' || window.location.pathname === '/resale';
    if (isShop) {
      input.addEventListener('input', debounce((e) => {
        shopState.search = e.target.value.trim();
        shopState.page = 1;
        if (typeof fetchShopProducts === 'function') {
          fetchShopProducts();
        }
      }, 300));
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = input.value.trim();
        if (isShop) {
          shopState.search = val;
          shopState.page = 1;
          if (typeof fetchShopProducts === 'function') {
            fetchShopProducts();
          }
        } else if (val) {
          window.location.href = `/shop?search=${encodeURIComponent(val)}`;
        }
      }
    });
  });

  // 5. Replace Static $ with ₹ globally on load
  replaceDollarSymbolsGlobally();

  // 6. Handle Image Errors
  document.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') {
      console.log('Image failed to load, replacing with branded placeholder:', e.target.src);
      e.target.src = BRANDED_FALLBACK_IMAGE;
    }
  }, true);
}

let localCartCache = null;
let activeCartPromise = null;
function getCartData(forceRefresh = false) {
  if (!forceRefresh && localCartCache !== null) {
    return Promise.resolve(localCartCache);
  }
  if (activeCartPromise) return activeCartPromise;
  activeCartPromise = fetch('/api/cart')
    .then(res => {
      if (!res.ok) throw new Error('Not logged in');
      return res.json();
    })
    .then(items => {
      localCartCache = items;
      return items;
    })
    .finally(() => {
      setTimeout(() => { activeCartPromise = null; }, 100);
    });
  return activeCartPromise;
}

function updateCartBadge() {
  getCartData()
    .then(items => {
      const count = items.reduce((sum, item) => sum + item.quantity, 0);
      const badges = document.querySelectorAll('nav .absolute, nav span.bg-secondary-container, nav span.bg-secondary');
      badges.forEach(badge => {
        if (count > 0) {
          badge.textContent = count;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      });
    })
    .catch(() => {
      const badges = document.querySelectorAll('nav .absolute, nav span.bg-secondary-container, nav span.bg-secondary');
      badges.forEach(badge => badge.style.display = 'none');
    });
}

function replaceDollarSymbolsGlobally() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node;
  while (node = walker.nextNode()) {
    if (node.nodeValue.includes('$')) {
      // Avoid breaking script tags or style tags
      const parent = node.parentElement;
      if (parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') {
        // Replace something like $285.00 with appropriate INR conversion or just Indian Rupee symbol
        // For static placeholders, convert e.g. $285 -> ₹23,500.00
        node.nodeValue = node.nodeValue.replace(/\$([0-9,.]+)/g, (match, p1) => {
          const val = parseFloat(p1.replace(/,/g, ''));
          // Let's scale conversion: 1 USD = roughly 80 INR for streetwear tags
          let inrVal = val;
          if (val < 2000) {
            inrVal = val * 80;
          }
          return formatINR(inrVal);
        });
      }
    }
  }
}

// ==========================================
// 1. HOME PAGE INITIALIZATION
// ==========================================
function initHomePage() {
  fetch('/api/products/homepage')
    .then(res => res.json())
    .then(data => {
      const products = data.featured;
      if (!products || products.length === 0) return;

      const trendingSection = document.querySelector('section.py-24 .grid');
      if (trendingSection) {
        trendingSection.innerHTML = '';
        
        const bigProduct = products[0];
        const smallProduct1 = products[1] || products[0];
        const smallProduct2 = products[2] || products[0];

        // Build Big Card
        const bigCard = document.createElement('div');
        bigCard.className = 'md:col-span-8 group cursor-pointer overflow-hidden border border-outline-variant bg-white p-8 transition-all hover:border-secondary';
        bigCard.addEventListener('click', () => window.location.href = `/product/${bigProduct.slug}`);
        bigCard.innerHTML = `
          <div class="flex justify-between items-start mb-8">
            <div>
              <span class="bg-tertiary/10 text-tertiary font-label-sm text-label-sm px-2 py-1 uppercase">${bigProduct.category_name || 'SNEAKER'}</span>
              <h3 class="font-headline-lg text-headline-lg mt-2 uppercase">${bigProduct.name}</h3>
            </div>
            <span class="font-headline-md text-headline-md text-secondary">${formatINR(bigProduct.price)}</span>
          </div>
          <div class="relative h-96 flex justify-center items-center">
            <img alt="${bigProduct.name}" class="h-full object-contain group-hover:scale-110 transition-transform duration-500" src="${bigProduct.image_url}" loading="lazy" />
          </div>
        `;
        trendingSection.appendChild(bigCard);

        // Build Small Card 1
        const smallCard1 = document.createElement('div');
        smallCard1.className = 'md:col-span-4 group cursor-pointer overflow-hidden border border-outline-variant bg-white p-6 transition-all hover:border-secondary';
        smallCard1.addEventListener('click', () => window.location.href = `/product/${smallProduct1.slug}`);
        smallCard1.innerHTML = `
          <div class="mb-4">
            <span class="font-label-sm text-label-sm text-on-surface-variant uppercase">${smallProduct1.category_name || 'SNEAKER'}</span>
            <h3 class="font-headline-md text-headline-md uppercase">${smallProduct1.name}</h3>
          </div>
          <div class="relative h-64 flex justify-center items-center mb-4">
            <img alt="${smallProduct1.name}" class="h-full object-contain group-hover:scale-110 transition-transform duration-500" src="${smallProduct1.image_url}" loading="lazy" />
          </div>
          <div class="flex justify-between items-center">
            <span class="font-body-md text-body-md text-secondary">${formatINR(smallProduct1.price)}</span>
            <button class="material-symbols-outlined hover:text-secondary quick-add-btn" data-id="${smallProduct1.id}" data-size="${smallProduct1.sizes[0] || '10'}">add_shopping_cart</button>
          </div>
        `;
        trendingSection.appendChild(smallCard1);

        // Build Small Card 2
        const smallCard2 = document.createElement('div');
        smallCard2.className = 'md:col-span-4 group cursor-pointer overflow-hidden border border-outline-variant bg-white p-6 transition-all hover:border-secondary';
        smallCard2.addEventListener('click', () => window.location.href = `/product/${smallProduct2.slug}`);
        smallCard2.innerHTML = `
          <div class="mb-4 text-center">
            <span class="font-label-sm text-label-sm text-on-surface-variant uppercase">${smallProduct2.category_name || 'SNEAKER'}</span>
            <h3 class="font-headline-md text-headline-md uppercase">${smallProduct2.name}</h3>
          </div>
          <div class="relative h-64 flex justify-center items-center">
            <img alt="${smallProduct2.name}" class="h-full object-contain group-hover:rotate-6 transition-transform duration-500" src="${smallProduct2.image_url}" loading="lazy" />
          </div>
          <div class="mt-4 flex justify-between items-center">
            <span class="font-body-md text-body-md text-secondary">${formatINR(smallProduct2.price)}</span>
            <button class="bg-on-surface text-white px-4 py-2 font-label-md text-label-md quick-add-btn" data-id="${smallProduct2.id}" data-size="${smallProduct2.sizes[0] || '10'}">QUICK ADD</button>
          </div>
        `;
        trendingSection.appendChild(smallCard2);

        // Build static Join Syndicate Card
        const syndicateCard = document.createElement('div');
        syndicateCard.className = 'md:col-span-8 bg-on-secondary-fixed text-secondary-fixed p-12 flex flex-col justify-center relative overflow-hidden';
        syndicateCard.innerHTML = `
          <div class="relative z-10">
            <h2 class="font-display-lg text-display-lg mb-6">UNLEASH THE<br/>CULTURE.</h2>
            <p class="font-body-lg text-body-lg max-w-md mb-8">Join the inner circle of sneakerheads redefining the urban landscape.</p>
            <button class="bg-secondary text-white px-10 py-4 font-headline-md text-headline-md hover:scale-105 transition-transform" onclick="window.location.href='/signup'">JOIN THE SYNDICATE</button>
          </div>
          <div class="absolute -right-20 -bottom-20 opacity-10">
            <span class="material-symbols-outlined text-[400px]" data-icon="bolt">bolt</span>
          </div>
        `;
        trendingSection.appendChild(syndicateCard);

        document.querySelectorAll('.quick-add-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const prodId = btn.dataset.id;
            const size = btn.dataset.size;
            addToCart(prodId, size, 1);
          });
        });
      }

      // Render Latest Drops grid
      const latestGrid = document.getElementById('latest-drops-grid');
      const latestDrops = data.latest_drops || [];
      if (latestGrid && latestDrops.length > 0) {
        latestGrid.innerHTML = '';
        latestDrops.forEach(p => {
          const card = document.createElement('div');
          card.className = 'group cursor-pointer';
          card.addEventListener('click', () => window.location.href = `/product/${p.slug}`);
          card.innerHTML = `
            <div class="relative aspect-square bg-surface-container-low border border-outline-variant p-6 mb-4 overflow-hidden">
              <img alt="${p.name}" class="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" src="${p.image_url}" loading="lazy"/>
              <div class="absolute inset-x-0 bottom-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform bg-white/70 backdrop-blur-xl flex justify-center gap-4 border-t border-outline-variant">
                <button class="material-symbols-outlined text-secondary hover:scale-110 cart-add-btn" data-id="${p.id}" data-size="${p.sizes[0] || '10'}">shopping_cart</button>
                <button class="material-symbols-outlined text-secondary hover:scale-110 wishlist-add-btn" data-id="${p.id}">favorite</button>
              </div>
            </div>
            <div class="space-y-1">
              <div class="flex justify-between items-start">
                <h4 class="font-headline-md text-body-md font-bold uppercase tracking-tight">${p.name}</h4>
                <span class="font-label-md text-label-md text-secondary">${formatINR(p.price)}</span>
              </div>
              <p class="font-label-sm text-label-sm text-on-surface-variant">${p.brand.toUpperCase()} - ${p.category_name?.toUpperCase() || 'SNEAKER'}</p>
            </div>
          `;
          card.querySelector('.cart-add-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            addToCart(p.id, p.sizes[0] || '10', 1);
          });
          card.querySelector('.wishlist-add-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            addToWishlist(p.id);
          });
          latestGrid.appendChild(card);
        });
      }
    });

  // Hero Section Buttons
  const shopSneakersBtn = document.querySelector('section.hero-gradient button:nth-of-type(1)');
  const exploreCollectionBtn = document.querySelector('section.hero-gradient button:nth-of-type(2)');
  if (shopSneakersBtn) shopSneakersBtn.addEventListener('click', () => window.location.href = '/shop');
  if (exploreCollectionBtn) exploreCollectionBtn.addEventListener('click', () => window.location.href = '/shop?category=collection');
}

async function addToCart(productId, size, quantity) {
  // Show toast instantly
  showToast('Product successfully added to your bag!', 'success');
  
  // Optimistically increment badge count
  const badges = document.querySelectorAll('nav .absolute, nav span.bg-secondary-container, nav span.bg-secondary');
  badges.forEach(badge => {
    const current = parseInt(badge.textContent) || 0;
    badge.textContent = current + quantity;
    badge.style.display = 'flex';
  });

  try {
    const res = await fetch('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, size, quantity })
    });
    const data = await res.json();
    if (res.ok) {
      // Force refresh cache and sync badge
      getCartData(true).then(() => {
        updateCartBadge();
      });
    } else {
      if (res.status === 401) {
        window.location.href = '/login';
      } else {
        showToast(data.error || 'Failed to add item to bag.', 'error');
        // Revert badge count
        getCartData(true).then(() => {
          updateCartBadge();
        });
      }
    }
  } catch (err) {
    console.error(err);
    // Revert badge count
    getCartData(true).then(() => {
      updateCartBadge();
    });
  }
}

// ==========================================
// 2. SHOP PAGE INITIALIZATION
// ==========================================
let shopState = {
  category: '',
  section: '',
  search: '',
  brands: [],
  sizes: [],
  colors: [],
  minPrice: 0,
  maxPrice: 200000,
  sort: 'featured',
  page: 1,
  limit: 12
};

function initShopPage() {
  const path = window.location.pathname;
  if (path === '/new-arrivals') {
    shopState.section = 'new-release';
  } else if (path === '/collection') {
    shopState.section = 'collection';
  } else if (path === '/limited-edition') {
    shopState.section = 'limited-edition';
  } else if (path === '/resale') {
    shopState.section = 'resale';
  }

  // Parse Query Parameters
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('category')) shopState.category = urlParams.get('category');
  if (urlParams.get('search')) {
    shopState.search = urlParams.get('search');
    // Pre-populate search bar
    const searchBar = document.querySelector('input[placeholder*="Search"]');
    if (searchBar) searchBar.value = shopState.search;
  }

  // Fetch Categories & Store Sections dynamically for sidebar filters
  Promise.all([
    fetchCached('/api/categories'),
    fetchCached('/api/sections')
  ]).then(([categories, sections]) => {
    const catList = document.getElementById('shop-categories-list');
    if (catList) {
      catList.innerHTML = '';
      categories.forEach(c => {
        const active = shopState.category === c.slug;
        const label = document.createElement('label');
        label.className = 'flex items-center gap-3 cursor-pointer group';
        label.innerHTML = `
          <input class="w-5 h-5 border-2 border-outline-variant rounded-none checked:bg-secondary checked:border-secondary focus:ring-0 transition-all filter-cat-cb" type="checkbox" data-category="${c.slug}" ${active ? 'checked' : ''}/>
          <span class="font-label-md text-label-md group-hover:text-secondary uppercase">${c.name}</span>
        `;
        catList.appendChild(label);
        
        label.querySelector('input').addEventListener('change', (e) => {
          const isChecked = e.target.checked;
          catList.querySelectorAll('input').forEach(input => {
            if (input !== e.target) input.checked = false;
          });
          shopState.category = isChecked ? c.slug : null;
          shopState.page = 1;
          debouncedFetchShopProducts();
        });
      });
    }

    const secList = document.getElementById('shop-sections-list');
    if (secList) {
      secList.innerHTML = '';
      sections.forEach(s => {
        const active = shopState.section === s.slug;
        const label = document.createElement('label');
        label.className = 'flex items-center gap-3 cursor-pointer group';
        label.innerHTML = `
          <input class="w-5 h-5 border-2 border-outline-variant rounded-none checked:bg-secondary checked:border-secondary focus:ring-0 transition-all filter-sec-cb" type="checkbox" data-section="${s.slug}" ${active ? 'checked' : ''}/>
          <span class="font-label-md text-label-md group-hover:text-secondary uppercase">${s.name}</span>
        `;
        secList.appendChild(label);
        
        label.querySelector('input').addEventListener('change', (e) => {
          const isChecked = e.target.checked;
          secList.querySelectorAll('input').forEach(input => {
            if (input !== e.target) input.checked = false;
          });
          shopState.section = isChecked ? s.slug : null;
          shopState.page = 1;
          debouncedFetchShopProducts();
        });
      });
    }
  }).catch(err => console.error('Error loading filters:', err));

  // Dynamic Sidebar Inputs listeners (brands)
  const brandCheckboxes = document.querySelectorAll('aside input[type="checkbox"]:not(.filter-cat-cb):not(.filter-sec-cb)');
  brandCheckboxes.forEach(cb => {
    cb.checked = false;
    cb.addEventListener('change', () => {
      const brandName = cb.nextElementSibling.textContent.trim().toUpperCase();
      if (cb.checked) {
        shopState.brands.push(brandName);
      } else {
        shopState.brands = shopState.brands.filter(b => b !== brandName);
      }
      shopState.page = 1;
      debouncedFetchShopProducts();
    });
  });

  // Size filters
  const sizeButtons = document.querySelectorAll('aside div.grid-cols-3 button');
  sizeButtons.forEach(btn => {
    btn.classList.remove('border-2', 'border-secondary', 'bg-secondary-container/10');
    btn.classList.add('border', 'border-outline-variant');
    btn.addEventListener('click', () => {
      const sizeVal = btn.textContent.trim();
      if (shopState.sizes.includes(sizeVal)) {
        shopState.sizes = shopState.sizes.filter(s => s !== sizeVal);
        btn.classList.remove('border-2', 'border-secondary', 'bg-secondary-container/10');
        btn.classList.add('border', 'border-outline-variant');
      } else {
        shopState.sizes.push(sizeVal);
        btn.classList.remove('border', 'border-outline-variant');
        btn.classList.add('border-2', 'border-secondary', 'bg-secondary-container/10');
      }
      shopState.page = 1;
      debouncedFetchShopProducts();
    });
  });

  // Color filters
  const colorButtons = document.querySelectorAll('aside button[title]');
  colorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const colorVal = btn.getAttribute('title');
      if (shopState.colors.includes(colorVal)) {
        shopState.colors = shopState.colors.filter(c => c !== colorVal);
        btn.style.boxShadow = '';
      } else {
        shopState.colors.push(colorVal);
        btn.style.boxShadow = '0 0 0 3px #855300';
      }
      shopState.page = 1;
      debouncedFetchShopProducts();
    });
  });

  // Price slider
  const priceSlider = document.querySelector('aside input[type="range"]');
  if (priceSlider) {
    priceSlider.min = 1000;
    priceSlider.max = 150000;
    priceSlider.value = 150000;
    priceSlider.step = 5000;
    const priceLabels = priceSlider.nextElementSibling;
    if (priceLabels) {
      priceLabels.innerHTML = `<span>₹1,000</span><span>₹1,50,000+</span>`;
    }

    priceSlider.addEventListener('input', debouncedFetchShopProducts);
    priceSlider.addEventListener('change', () => {
      shopState.maxPrice = parseFloat(priceSlider.value);
      shopState.page = 1;
      debouncedFetchShopProducts();
    });
  }

  // Reset Filters Button
  const resetBtn = document.querySelector('aside button.bg-secondary');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      shopState.brands = [];
      shopState.sizes = [];
      shopState.colors = [];
      shopState.maxPrice = 200000;
      shopState.category = null;
      shopState.section = null;
      shopState.page = 1;
      
      brandCheckboxes.forEach(cb => cb.checked = false);
      const catList = document.getElementById('shop-categories-list');
      if (catList) catList.querySelectorAll('input').forEach(i => i.checked = false);
      const secList = document.getElementById('shop-sections-list');
      if (secList) secList.querySelectorAll('input').forEach(i => i.checked = false);
      
      sizeButtons.forEach(btn => {
        btn.classList.remove('border-2', 'border-secondary', 'bg-secondary-container/10');
        btn.classList.add('border', 'border-outline-variant');
      });
      colorButtons.forEach(btn => btn.style.boxShadow = '');
      if (priceSlider) priceSlider.value = 150000;
      fetchShopProducts();
    });
  }

  // Sort Dropdown (Absolute Positioning, Non-blocking, No Prompt)
  const sortBtn = document.querySelector('header button.group');
  if (sortBtn) {
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      let dropdown = document.getElementById('sort-dropdown-menu');
      if (dropdown) {
        dropdown.remove();
        return;
      }
      dropdown = document.createElement('div');
      dropdown.id = 'sort-dropdown-menu';
      dropdown.className = 'absolute z-50 bg-white border border-outline-variant shadow-lg py-2 w-48 font-label-md text-sm';
      dropdown.innerHTML = `
        <button class="w-full text-left px-4 py-2 hover:bg-surface-container-high transition-colors ${shopState.sort === 'featured' ? 'font-bold text-secondary' : ''}" data-sort="featured">Featured</button>
        <button class="w-full text-left px-4 py-2 hover:bg-surface-container-high transition-colors ${shopState.sort === 'price-low' ? 'font-bold text-secondary' : ''}" data-sort="price-low">Price: Low to High</button>
        <button class="w-full text-left px-4 py-2 hover:bg-surface-container-high transition-colors ${shopState.sort === 'price-high' ? 'font-bold text-secondary' : ''}" data-sort="price-high">Price: High to Low</button>
        <button class="w-full text-left px-4 py-2 hover:bg-surface-container-high transition-colors ${shopState.sort === 'newest' ? 'font-bold text-secondary' : ''}" data-sort="newest">Newest</button>
      `;
      document.body.appendChild(dropdown);
      
      const rect = sortBtn.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom + window.scrollY}px`;
      dropdown.style.left = `${rect.left + window.scrollX}px`;
      
      dropdown.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const sortVal = btn.dataset.sort;
          shopState.sort = sortVal;
          sortBtn.childNodes[0].textContent = btn.textContent + ' ';
          dropdown.remove();
          shopState.page = 1;
          fetchShopProducts();
        });
      });
      
      const closeDropdown = () => {
        dropdown.remove();
        document.removeEventListener('click', closeDropdown);
      };
      setTimeout(() => document.addEventListener('click', closeDropdown), 10);
    });
  }

  // Load products
  fetchShopProducts();
}

const debouncedFetchShopProducts = debounce(fetchShopProducts, 200);

function fetchShopProducts() {
  const grid = document.getElementById('product-grid');
  const spinner = document.querySelector('main div.py-20');
  if (!grid) return;

  if (spinner) spinner.style.display = 'flex';

  // Construct Query String
  let url = `/api/products?page=${shopState.page}&limit=${shopState.limit}&sort=${shopState.sort}`;
  if (shopState.category) url += `&category=${shopState.category}`;
  if (shopState.section) url += `&section=${shopState.section}`;
  if (shopState.search) url += `&search=${encodeURIComponent(shopState.search)}`;
  
  // Wait, backend supports singular brand, let's pass the first brand, or filter in frontend
  if (shopState.brands.length > 0) url += `&brand=${encodeURIComponent(shopState.brands[0])}`;

  fetchCached(url, 15000)
    .then(data => {
      if (spinner) spinner.style.display = 'none';
      grid.innerHTML = '';

      let products = data.products;
      if (!products || products.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-16 text-center text-on-surface-variant font-body-lg">No products found matching the criteria.</div>`;
        
        // Clear pagination container too
        const paginationContainer = document.getElementById('shop-pagination');
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
      }

      // Client side filtering for sizes and colors if multiple selected
      if (shopState.sizes.length > 0) {
        products = products.filter(p => p.sizes.some(sz => shopState.sizes.includes(sz)));
      }
      if (shopState.colors.length > 0) {
        products = products.filter(p => p.colors.some(col => shopState.colors.includes(col)));
      }
      
      // Client side filtering for max price
      products = products.filter(p => p.price <= shopState.maxPrice);

      if (products.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-16 text-center text-on-surface-variant font-body-lg">No products found matching the filters.</div>`;
        const paginationContainer = document.getElementById('shop-pagination');
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
      }

      products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'group cursor-pointer';
        card.addEventListener('click', () => window.location.href = `/product/${p.slug}`);

        let badgeHtml = '';
        if (p.is_limited_edition) {
          badgeHtml = `<div class="absolute top-4 left-4 z-10"><span class="px-3 py-1 bg-tertiary text-white font-label-sm text-label-sm">RARE</span></div>`;
        } else if (p.is_new_arrival) {
          badgeHtml = `<div class="absolute top-4 left-4 z-10 border-l-4 border-secondary px-3 py-1 bg-white font-label-sm text-label-sm">NEW</div>`;
        }

        card.innerHTML = `
          <div class="relative aspect-square bg-surface-container-low border border-outline-variant p-8 mb-4 overflow-hidden">
            ${badgeHtml}
            <img alt="${p.name}" class="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" src="${p.image_url}" loading="lazy"/>
            <div class="absolute inset-x-0 bottom-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform bg-white/70 backdrop-blur-xl flex justify-center gap-4 border-t border-outline-variant">
              <button class="material-symbols-outlined text-secondary hover:scale-110 cart-add-btn" data-id="${p.id}" data-size="${p.sizes[0] || '10'}">shopping_cart</button>
              <button class="material-symbols-outlined text-secondary hover:scale-110 wishlist-add-btn" data-id="${p.id}">favorite</button>
            </div>
          </div>
          <div class="space-y-1">
            <div class="flex justify-between items-start">
              <h4 class="font-headline-md text-body-md font-bold uppercase tracking-tight">${p.name}</h4>
              <span class="font-label-md text-label-md text-secondary">${formatINR(p.price)}</span>
            </div>
            <p class="font-label-sm text-label-sm text-on-surface-variant">${p.brand.toUpperCase()} - ${p.category_name ? p.category_name.toUpperCase() : 'SNEAKER'}</p>
          </div>
        `;

        // Wire Add to bag & wishlist
        card.querySelector('.cart-add-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          addToCart(p.id, p.sizes[0] || '10', 1);
        });

        card.querySelector('.wishlist-add-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          addToWishlist(p.id);
        });

        grid.appendChild(card);
      });

      // Render Pagination
      const paginationContainer = document.getElementById('shop-pagination');
      if (paginationContainer) {
        paginationContainer.innerHTML = '';
        const pg = data.pagination;
        if (pg && pg.totalPages > 1) {
          // Prev button
          const prevBtn = document.createElement('button');
          prevBtn.className = `px-4 py-2 border border-outline-variant font-label-sm text-label-sm hover:border-secondary transition-colors ${pg.currentPage === 1 ? 'opacity-50 pointer-events-none' : ''}`;
          prevBtn.textContent = 'PREV';
          prevBtn.addEventListener('click', () => {
            shopState.page = pg.currentPage - 1;
            fetchShopProducts();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
          paginationContainer.appendChild(prevBtn);

          // Page numbers
          for (let i = 1; i <= pg.totalPages; i++) {
            const pageBtn = document.createElement('button');
            const isActive = pg.currentPage === i;
            pageBtn.className = `w-10 h-10 border font-label-sm text-label-sm transition-colors ${isActive ? 'border-2 border-secondary bg-secondary-container/10 font-bold' : 'border-outline-variant hover:border-secondary'}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener('click', () => {
              shopState.page = i;
              fetchShopProducts();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            paginationContainer.appendChild(pageBtn);
          }

          // Next button
          const nextBtn = document.createElement('button');
          nextBtn.className = `px-4 py-2 border border-outline-variant font-label-sm text-label-sm hover:border-secondary transition-colors ${pg.currentPage === pg.totalPages ? 'opacity-50 pointer-events-none' : ''}`;
          nextBtn.textContent = 'NEXT';
          nextBtn.addEventListener('click', () => {
            shopState.page = pg.currentPage + 1;
            fetchShopProducts();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
          paginationContainer.appendChild(nextBtn);
        }
      }
    });
}

async function addToWishlist(productId) {
  showToast('Product saved to wishlist!', 'success');
  const hearts = document.querySelectorAll(`.wishlist-add-btn[data-id="${productId}"]`);
  const originalStyles = Array.from(hearts).map(heart => ({
    color: heart.style.color,
    fontVariationSettings: heart.style.fontVariationSettings
  }));
  
  hearts.forEach(heart => {
    heart.style.color = '#ba1a1a';
    heart.style.fontVariationSettings = "'FILL' 1";
  });

  try {
    const res = await fetch('/api/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId })
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        window.location.href = '/login';
      } else {
        showToast(data.error || 'Failed to save to wishlist.', 'error');
        // Revert hearts style
        hearts.forEach((heart, idx) => {
          heart.style.color = originalStyles[idx].color;
          heart.style.fontVariationSettings = originalStyles[idx].fontVariationSettings;
        });
      }
    }
  } catch (err) {
    console.error(err);
    // Revert hearts style
    hearts.forEach((heart, idx) => {
      heart.style.color = originalStyles[idx].color;
      heart.style.fontVariationSettings = originalStyles[idx].fontVariationSettings;
    });
  }
}

// ==========================================
// 3. PRODUCT DETAIL PAGE
// ==========================================
let productState = {
  id: null,
  selectedSize: null
};

function initProductPage() {
  const parts = window.location.pathname.split('/');
  const slug = parts[parts.length - 1];

  fetchCached(`/api/products/${slug}`, 30000)
    .then(p => {
      productState.id = p.id;
      
      // Update metadata and titles
      document.title = `${p.name} | MAGMAZOES`;
      const nameHeader = document.querySelector('h1.font-display-lg');
      if (nameHeader) {
        nameHeader.innerHTML = `${p.name.split(' ')[0]} <span class="text-secondary-container">${p.name.split(' ').slice(1).join(' ')}</span>`;
      }
      
      const priceTag = document.querySelector('span.text-headline-lg');
      if (priceTag) priceTag.textContent = formatINR(p.price);

      const desc = document.querySelector('p.text-on-surface-variant');
      if (desc) desc.textContent = p.brand + ' - ' + p.description;

      // Gallery Images & Thumbnails
      const mainImg = document.querySelector('.aspect-square img');
      if (mainImg) {
        mainImg.src = p.image_url;
        mainImg.loading = 'lazy';
      }

      const thumbnailsContainer = document.getElementById('gallery-thumbnails');
      if (thumbnailsContainer) {
        thumbnailsContainer.innerHTML = '';
        const imagesList = (p.images && p.images.length > 0) ? p.images : [{ url: p.image_url, is_primary: 1 }];
        
        imagesList.forEach((imgObj, idx) => {
          const img = document.createElement('img');
          img.src = imgObj.url;
          img.alt = `${p.name} view ${idx + 1}`;
          img.className = `w-20 h-20 flex-shrink-0 object-contain border p-2 cursor-pointer transition-all hover:border-secondary ${imgObj.is_primary ? 'border-2 border-secondary bg-surface-container' : 'border-outline-variant bg-white'}`;
          img.loading = 'lazy';
          
          img.addEventListener('click', () => {
            if (mainImg) mainImg.src = imgObj.url;
            thumbnailsContainer.querySelectorAll('img').forEach(el => {
              el.classList.remove('border-2', 'border-secondary', 'bg-surface-container');
              el.classList.add('border-outline-variant', 'bg-white');
            });
            img.classList.remove('border-outline-variant', 'bg-white');
            img.classList.add('border-2', 'border-secondary', 'bg-surface-container');
          });
          
          thumbnailsContainer.appendChild(img);
        });
      }

      // Dynamic Size rendering with inventory tracking & OOS checks
      const sizeContainer = document.querySelector('div.grid-cols-4');
      if (sizeContainer && p.size_inventory && p.size_inventory.length > 0) {
        sizeContainer.innerHTML = '';
        let firstAvailableSize = null;
        
        p.size_inventory.forEach((szObj) => {
          const sz = szObj.size;
          const stock = szObj.stock;
          const isOOS = stock <= 0;
          
          const btn = document.createElement('button');
          btn.className = `h-12 border font-label-md text-label-md transition-all relative`;
          btn.textContent = sz;
          
          if (isOOS) {
            btn.className += ' border-outline-variant opacity-30 cursor-not-allowed line-through';
            btn.disabled = true;
            
            const oosDot = document.createElement('span');
            oosDot.className = 'absolute -top-1.5 -right-1.5 bg-error text-white text-[8px] px-1 rounded-full';
            oosDot.textContent = 'OOS';
            btn.appendChild(oosDot);
          } else {
            if (!firstAvailableSize) {
              firstAvailableSize = sz;
              btn.className += ' border-2 border-secondary-container bg-secondary-fixed/10';
              productState.selectedSize = sz;
            } else {
              btn.className += ' border-outline-variant hover:border-secondary-container';
            }
            
            btn.addEventListener('click', () => {
              document.querySelectorAll('div.grid-cols-4 button').forEach(b => {
                if (!b.disabled) {
                  b.className = 'h-12 border border-outline-variant font-label-md text-label-md hover:border-secondary-container transition-all relative';
                }
              });
              btn.className = 'h-12 border-2 border-secondary-container font-label-md text-label-md bg-secondary-fixed/10 relative';
              productState.selectedSize = sz;
            });
          }
          
          sizeContainer.appendChild(btn);
        });

        if (!firstAvailableSize) {
          productState.selectedSize = null;
        }
      }

      // Dynamic Add to bag & Wishlist
      const addBagBtn = document.querySelector('button.bg-secondary-container');
      if (addBagBtn) {
        addBagBtn.addEventListener('click', () => {
          if (!productState.selectedSize) {
            showToast('Please select an available size first.', 'warning');
            return;
          }
          addToCart(p.id, productState.selectedSize, 1);
        });
      }

      const addWishlistBtn = document.querySelector('button.border-2.border-outline-variant');
      if (addWishlistBtn) {
        addWishlistBtn.addEventListener('click', () => {
          addToWishlist(p.id);
        });
      }

      // Related Products (You May Also Like)
      fetchCached(`/api/products/${p.id}/related`, 30000)
        .then(relatedData => {
          const section = document.getElementById('related-products-section');
          const grid = document.getElementById('related-products-grid');
          if (grid) {
            grid.innerHTML = '';
            if (!relatedData || relatedData.length === 0) {
              if (section) section.style.display = 'none';
              return;
            }
            if (section) section.style.display = 'block';

            relatedData.forEach(item => {
              const card = document.createElement('div');
              card.className = 'bg-white border border-outline-variant group flex flex-col justify-between h-full';
              card.innerHTML = `
                <div class="aspect-[4/5] bg-surface-container-low overflow-hidden relative flex items-center justify-center">
                  <img src="${item.image_url}" class="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  <div class="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors"></div>
                  <div class="absolute top-4 left-4 font-label-sm text-label-sm bg-black text-white px-2 py-0.5">${item.brand}</div>
                </div>
                <div class="p-6 flex flex-col justify-between flex-grow">
                  <div class="mb-4">
                    <div class="flex justify-between mb-2">
                      <span class="font-label-md text-label-md uppercase tracking-wider truncate mr-2" title="${item.name}">${item.name}</span>
                      <span class="font-label-md text-label-md flex-shrink-0">${formatINR(item.price)}</span>
                    </div>
                    <p class="font-body-md text-sm text-on-surface-variant">${item.brand}</p>
                  </div>
                  <button class="w-full py-3 border border-on-surface font-label-sm text-label-sm hover:bg-on-surface hover:text-white transition-all uppercase" onclick="window.location.href='/product/${item.slug}'">VIEW DETAILS</button>
                </div>
              `;
              grid.appendChild(card);
            });
          }
        })
        .catch(err => {
          console.error('Failed to load related products:', err);
          const section = document.getElementById('related-products-section');
          if (section) section.style.display = 'none';
        });
    });
}

// ==========================================
// 4. CART / BAG PAGE INITIALIZATION
// ==========================================
let cartPromo = {
  code: '',
  discountPercent: 0
};

function showOrderSuccessModal(data) {
  let modal = document.getElementById('order-success-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'order-success-modal';
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
  modal.innerHTML = `
    <div class="bg-white p-8 max-w-md w-full border border-outline-variant shadow-2xl flex flex-col gap-6 text-center animate-fade-in">
      <div class="flex flex-col items-center gap-4">
        <span class="material-symbols-outlined text-[64px] text-tertiary">check_circle</span>
        <h2 class="font-headline-lg text-headline-lg uppercase tracking-tight text-on-surface">Order Confirmed!</h2>
        <p class="font-body-md text-on-surface-variant text-sm">Your order has been placed successfully and is being processed.</p>
      </div>
      
      <div class="bg-surface-container-low p-6 border border-outline-variant text-left space-y-3 font-label-md text-sm">
        <div class="flex justify-between border-b border-outline-variant pb-2">
          <span class="text-on-surface-variant font-bold">Order ID:</span>
          <span class="text-on-surface">#${data.orderId || 'N/A'}</span>
        </div>
        <div class="flex justify-between border-b border-outline-variant pb-2">
          <span class="text-on-surface-variant font-bold">Tracking Number:</span>
          <span class="text-on-surface font-mono">${data.trackingNumber || 'N/A'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-on-surface-variant font-bold">Total Paid:</span>
          <span class="text-secondary font-bold">${formatINR(data.total || 0)}</span>
        </div>
      </div>

      <div class="flex flex-col gap-3">
        <button id="success-btn-orders" class="w-full bg-secondary text-white py-4 font-headline-md text-sm uppercase tracking-wider hover:bg-secondary/90 transition-colors">
          Go To My Orders
        </button>
        <button id="success-btn-invoice" class="w-full border border-outline-variant py-4 font-headline-md text-sm uppercase tracking-wider hover:bg-surface-container-high transition-colors">
          Download GST Invoice
        </button>
        <button id="success-btn-home" class="w-full text-on-surface-variant hover:text-on-surface text-xs font-label-md underline">
          Continue Shopping
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('success-btn-orders').addEventListener('click', () => {
    modal.remove();
    window.location.href = '/account?tab=orders';
  });

  document.getElementById('success-btn-invoice').addEventListener('click', () => {
    window.open(`/order-invoice/${data.orderId}`, '_blank');
  });

  document.getElementById('success-btn-home').addEventListener('click', () => {
    modal.remove();
    window.location.href = '/';
  });
}

function openCheckoutModal(totalText, onConfirm) {
  let modal = document.getElementById('checkout-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'checkout-modal';
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
  modal.innerHTML = `
    <div class="bg-white p-8 max-w-lg w-full border border-outline-variant shadow-2xl flex flex-col gap-6 relative max-h-[95vh] overflow-y-auto custom-scrollbar">
      <button id="checkout-close-x" class="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface no-print">
        <span class="material-symbols-outlined">close</span>
      </button>
      <div>
        <h2 class="font-headline-md text-headline-md uppercase tracking-tight text-on-surface">Checkout Information</h2>
        <p class="font-label-sm text-label-sm text-on-surface-variant mt-1">Please enter your shipping & contact details to place the order.</p>
      </div>
      
      <form id="checkout-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4 font-label-md text-label-md">
        <div class="sm:col-span-2">
          <label class="block mb-1 text-on-surface-variant text-label-sm">Full Name *</label>
          <input type="text" id="checkout-name" class="w-full p-3 border rounded border-outline-variant focus:border-secondary outline-none transition-colors" placeholder="e.g. John Doe" required />
        </div>
        
        <div class="sm:col-span-2">
          <label class="block mb-1 text-on-surface-variant text-label-sm">Email Address *</label>
          <input type="email" id="checkout-email" class="w-full p-3 border rounded border-outline-variant focus:border-secondary outline-none transition-colors" placeholder="e.g. john@example.com" required />
        </div>
        
        <div>
          <label class="block mb-1 text-on-surface-variant text-label-sm">Phone Number *</label>
          <input type="tel" id="checkout-phone" class="w-full p-3 border rounded border-outline-variant focus:border-secondary outline-none transition-colors" placeholder="e.g. 9876543210" required />
        </div>
        
        <div>
          <label class="block mb-1 text-on-surface-variant text-label-sm">Pincode *</label>
          <input type="text" id="checkout-pincode" class="w-full p-3 border rounded border-outline-variant focus:border-secondary outline-none transition-colors" placeholder="e.g. 400001" required />
        </div>

        <div>
          <label class="block mb-1 text-on-surface-variant text-label-sm">State *</label>
          <input type="text" id="checkout-state" class="w-full p-3 border rounded border-outline-variant focus:border-secondary outline-none transition-colors" placeholder="e.g. Maharashtra" required />
        </div>
        
        <div>
          <label class="block mb-1 text-on-surface-variant text-label-sm">Address Locality *</label>
          <input type="text" id="checkout-locality" class="w-full p-3 border rounded border-outline-variant focus:border-secondary outline-none transition-colors" placeholder="e.g. Bandra West" required />
        </div>
        
        <!-- Payment Mode Selector -->
        <div class="sm:col-span-2 mt-2">
          <label class="block mb-2 text-on-surface-variant text-label-sm">Select Payment Method *</label>
          <div class="flex gap-4">
            <label class="flex-1 flex items-center justify-between p-3 border rounded border-outline-variant cursor-pointer hover:border-secondary transition-all">
              <div class="flex items-center gap-2">
                <input type="radio" name="checkout_payment_method" value="COD" checked class="accent-secondary" />
                <span class="text-sm font-bold">Cash on Delivery</span>
              </div>
              <span class="material-symbols-outlined text-sm text-on-surface-variant">payments</span>
            </label>
            <label class="flex-1 flex items-center justify-between p-3 border rounded border-outline-variant opacity-50 cursor-not-allowed transition-all">
              <div class="flex items-center gap-2">
                <input type="radio" name="checkout_payment_method" value="UPI" disabled class="accent-secondary cursor-not-allowed" />
                <span class="text-sm font-bold text-on-surface-variant">UPI Gateway</span>
              </div>
              <span class="material-symbols-outlined text-sm text-on-surface-variant">qr_code_2</span>
            </label>
          </div>
          
          <!-- UPI warning banner -->
          <div class="mt-3 p-3 bg-red-50 border-l-4 border-red-500 text-red-900 text-[11px] leading-relaxed flex items-start gap-2">
            <span class="material-symbols-outlined text-sm text-red-500 flex-shrink-0 mt-0.5">warning</span>
            <span>UPI Gateway is temporarily offline for maintenance. Please select Cash on Delivery (COD) to complete your order.</span>
          </div>
        </div>
        
        <div class="sm:col-span-2 mt-4 flex flex-col sm:flex-row gap-4">
          <button type="submit" class="flex-1 bg-secondary text-white py-4 font-headline-md text-[16px] uppercase tracking-wider hover:bg-secondary/90 transition-colors">
            Place Order (${totalText})
          </button>
          <button type="button" id="checkout-cancel-btn" class="px-6 py-4 border border-outline-variant hover:bg-surface-container transition-colors font-headline-md text-[16px] uppercase tracking-wider">
            Cancel
          </button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  const closeModal = () => {
    modal.remove();
  };

  document.getElementById('checkout-close-x').addEventListener('click', closeModal);
  document.getElementById('checkout-cancel-btn').addEventListener('click', closeModal);



  document.getElementById('checkout-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('checkout-name').value.trim();
    const email = document.getElementById('checkout-email').value.trim();
    const phone = document.getElementById('checkout-phone').value.trim();
    const pincode = document.getElementById('checkout-pincode').value.trim();
    const state = document.getElementById('checkout-state').value.trim();
    const locality = document.getElementById('checkout-locality').value.trim();

    let selectedPayment = 'COD';
    paymentRadios.forEach(radio => {
      if (radio.checked) selectedPayment = radio.value;
    });

    if (!name || !email || !phone || !pincode || !state || !locality) {
      showToast('All fields are required.', 'error');
      return;
    }

    const formattedAddress = `Name: ${name}, Email: ${email}, Phone: ${phone}, Locality: ${locality}, State: ${state}, Pincode: ${pincode}`;
    closeModal();
    onConfirm(formattedAddress, selectedPayment);
  });
}

function initCartPage() {
  fetchAndRenderCart();
  
  // Wire Promo Apply button
  const promoInput = document.querySelector('input[placeholder="APPLY CODE"]');
  const promoBtn = promoInput?.parentElement?.querySelector('button');
  
  if (promoBtn && promoInput) {
    promoBtn.addEventListener('click', async () => {
      const code = promoInput.value.trim();
      if (!code) return;

      try {
        const res = await fetch('/api/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const data = await res.json();
        
        if (res.ok) {
          cartPromo.code = data.code;
          cartPromo.discountPercent = data.discount_percent;
          showToast(`Coupon code "${data.code}" applied! ${data.discount_percent}% off.`, 'success');
          fetchAndRenderCart(); // Refresh summary values
        } else {
          showToast(data.error || 'Invalid coupon code.', 'error');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Wire Checkout Button
  const checkoutBtn = document.querySelector('button.bg-secondary-container');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      const totalEl = document.querySelector('aside span.text-secondary');
      const totalText = totalEl ? totalEl.textContent : '₹0.00';
      if (totalText === '₹0.00' || totalText === '₹0.00' || totalText === '₹0') {
        showToast('Your bag is empty.', 'warning');
        return;
      }

      openCheckoutModal(totalText, async (formattedAddress, paymentMethod) => {
        try {
          const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              promo_code: cartPromo.code,
              shipping_address: formattedAddress,
              payment_method: paymentMethod
            })
          });
          const data = await res.json();
          if (res.ok) {
            updateCartBadge();
            fetchAndRenderCart();
            showOrderSuccessModal(data);
          } else {
            showToast(data.error || 'Failed to place order.', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast('Failed to place order due to network issue.', 'error');
        }
      });
    });
  }
}

function fetchAndRenderCart(items = null) {
  const container = document.querySelector('section.lg\\:col-span-8');
  if (!container) return;

  const renderItems = (itemsList) => {
      // Keep shipping and promo form elements in DOM, clear only product cards
      const cards = container.querySelectorAll('.group.relative.flex');
      cards.forEach(c => c.remove());

      // Remove any existing empty state text
      const existingEmpty = container.querySelector('.py-16.text-center');
      if (existingEmpty) existingEmpty.remove();

      if (itemsList.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'py-16 text-center text-on-surface-variant font-body-lg group relative flex flex-col justify-center';
        emptyDiv.innerHTML = `Your bag is empty. <a href="/shop" class="text-secondary font-bold underline block mt-4">Shop products</a>`;
        container.insertBefore(emptyDiv, container.firstChild);
        updateOrderSummary(0, 0);
        
        // Ensure checkout button is updated
        const checkoutBtn = document.querySelector('button.bg-secondary-container');
        if (checkoutBtn) {
          checkoutBtn.disabled = true;
          checkoutBtn.className = 'w-full bg-outline-variant text-on-surface-variant font-headline-md py-6 cursor-not-allowed opacity-50 flex items-center justify-center gap-3';
          checkoutBtn.innerHTML = `BAG IS EMPTY`;
        }
        return;
      }

      let subtotal = 0;
      let hasInventoryError = false;
      
      // Inject cards backwards to keep form at bottom
      itemsList.forEach(item => {
        subtotal += item.price * item.quantity;
        
        const isOOS = item.available_stock <= 0;
        const isInsufficient = item.available_stock < item.quantity;
        if (isInsufficient) {
          hasInventoryError = true;
        }

        const card = document.createElement('div');
        card.className = 'group relative flex flex-col md:flex-row gap-6 p-6 bg-white gallery-border transition-all hover:shadow-lg hover:shadow-secondary-fixed/20';
        card.innerHTML = `
          <div class="w-full md:w-48 h-48 overflow-hidden bg-surface-container-high">
            <img src="${item.image_url}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
          </div>
          <div class="flex-1 flex flex-col justify-between">
            <div class="flex justify-between items-start">
              <div>
                <h2 class="font-headline-md text-headline-md tracking-tight uppercase">${item.name}</h2>
                <p class="font-label-md text-label-md text-on-surface-variant">BRAND: ${item.brand.toUpperCase()}</p>
                <p class="font-label-sm text-label-sm text-on-surface-variant mt-1 uppercase">SIZE: US ${item.size}</p>
                ${
                  isOOS ? `
                    <span class="inline-block mt-2 px-2 py-0.5 bg-error/10 text-error font-bold text-[10px] uppercase rounded">Out of Stock</span>
                  ` : isInsufficient ? `
                    <span class="inline-block mt-2 px-2 py-0.5 bg-error/10 text-error font-bold text-[10px] uppercase rounded">Insufficient Stock (Only ${item.available_stock} left)</span>
                  ` : item.available_stock <= 3 ? `
                    <span class="inline-block mt-2 px-2 py-0.5 bg-secondary-fixed/30 text-secondary font-bold text-[10px] uppercase rounded font-label-sm">Low Stock (Only ${item.available_stock} left)</span>
                  ` : ''
                }
              </div>
              <p class="font-headline-md text-headline-md">${formatINR(item.price)}</p>
            </div>
            <div class="flex items-center justify-between mt-6">
              <div class="flex items-center gallery-border overflow-hidden">
                <button class="px-4 py-2 hover:bg-surface-container transition-colors qty-minus" data-id="${item.id}" data-qty="${item.quantity}">
                   <span class="material-symbols-outlined text-[18px]">remove</span>
                </button>
                <span class="w-12 text-center bg-transparent border-none font-label-md text-label-md">${item.quantity}</span>
                <button class="px-4 py-2 hover:bg-surface-container transition-colors qty-plus" data-id="${item.id}" data-qty="${item.quantity}">
                   <span class="material-symbols-outlined text-[18px]">add</span>
                </button>
              </div>
              <button class="flex items-center gap-2 text-on-surface-variant hover:text-error transition-colors font-label-md text-label-md remove-item-btn" data-id="${item.id}">
                <span class="material-symbols-outlined text-[20px]">delete</span> REMOVE
              </button>
            </div>
          </div>
        `;

        // Wire Quantities
        card.querySelector('.qty-minus').addEventListener('click', () => {
          if (item.quantity > 1) {
            updateCartQuantity(item.id, item.quantity - 1);
          }
        });
        card.querySelector('.qty-plus').addEventListener('click', () => {
          updateCartQuantity(item.id, item.quantity + 1);
        });

        // Wire Remove
        card.querySelector('.remove-item-btn').addEventListener('click', () => {
          deleteCartItem(item.id);
        });

        container.insertBefore(card, container.querySelector('.grid-cols-1'));
      });

      const totalCount = itemsList.reduce((sum, item) => sum + item.quantity, 0);
      updateOrderSummary(subtotal, totalCount);

      // Disable/enable checkout button
      const checkoutBtn = document.querySelector('button.bg-secondary-container');
      if (checkoutBtn) {
        if (hasInventoryError) {
          checkoutBtn.disabled = true;
          checkoutBtn.className = 'w-full bg-outline-variant text-on-surface-variant font-headline-md py-6 cursor-not-allowed opacity-50 flex items-center justify-center gap-3';
          checkoutBtn.innerHTML = `INSUFFICIENT STOCK IN BAG`;
        } else {
          checkoutBtn.disabled = false;
          checkoutBtn.className = 'w-full bg-secondary-container text-on-secondary font-headline-md py-6 hover:scale-[1.02] transition-transform active:scale-100 flex items-center justify-center gap-3 group';
          checkoutBtn.innerHTML = `PROCEED TO CHECKOUT <span class="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>`;
        }
      }
  };

  if (items !== null) {
    renderItems(items);
    return;
  }

  getCartData()
    .then(items => {
      renderItems(items);
    })
    .catch(err => {
      if (err.message === 'Not logged in') {
        window.location.href = '/login';
      }
    });
}

function updateOrderSummary(subtotal, count = 0) {
  let discount = 0;
  if (cartPromo.discountPercent > 0) {
    discount = (subtotal * cartPromo.discountPercent) / 100;
  }
  const discountedSubtotal = subtotal - discount;

  // Fetch settings dynamically using cache to calculate tax and shipping
  fetchCached('/api/settings', 30000)
    .catch(() => {
      return [
        { key: 'tax_rate', value: '0.18' },
        { key: 'shipping_cost', value: '0' }
      ];
    })
    .then(settingsRows => {
      const taxRate = parseFloat(settingsRows.find(r => r.key === 'tax_rate')?.value || '0.18');
      const shippingCost = parseFloat(settingsRows.find(r => r.key === 'shipping_cost')?.value || '0');
      
      const tax = discountedSubtotal * taxRate;
      const total = discountedSubtotal + tax + shippingCost;

      const subtotalEl = document.querySelector('aside .space-y-4 div:nth-child(1) span:nth-child(2)');
      const taxEl = document.querySelector('aside .space-y-4 div:nth-child(3) span:nth-child(2)');
      const taxLabelEl = document.querySelector('aside .space-y-4 div:nth-child(3) span:nth-child(1)');
      if (taxLabelEl) {
        taxLabelEl.textContent = `Estimated Tax (${Math.round(taxRate * 100)}%)`;
      }
      
      const shippingEl = document.querySelector('aside .space-y-4 div:nth-child(4) span:nth-child(2)');
      if (shippingEl) {
        shippingEl.textContent = shippingCost === 0 ? 'FREE' : formatINR(shippingCost);
      }

      const totalEl = document.querySelector('aside span.text-secondary');

      if (subtotalEl) subtotalEl.textContent = formatINR(subtotal - discount);
      if (taxEl) taxEl.textContent = formatINR(tax);
      if (totalEl) totalEl.textContent = formatINR(total);
    });

  // Update header item counts
  const itemsText = document.querySelector('main header p');
  if (itemsText) {
    itemsText.textContent = `${count} ITEM${count === 1 ? '' : 'S'} — READY FOR DISPATCH`;
  }
}

async function updateCartQuantity(cartId, quantity) {
  const originalCache = localCartCache ? JSON.parse(JSON.stringify(localCartCache)) : null;
  if (localCartCache) {
    const item = localCartCache.find(i => i.id === cartId);
    if (item) {
      item.quantity = quantity;
      fetchAndRenderCart(localCartCache);
      
      // Update badge count instantly
      const totalCount = localCartCache.reduce((sum, i) => sum + i.quantity, 0);
      const badges = document.querySelectorAll('nav .absolute, nav span.bg-secondary-container, nav span.bg-secondary');
      badges.forEach(badge => {
        if (totalCount > 0) {
          badge.textContent = totalCount;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      });
    }
  }

  try {
    const res = await fetch(`/api/cart/${cartId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity })
    });
    if (res.ok) {
      const items = await res.json();
      localCartCache = items;
      fetchAndRenderCart(localCartCache);
    } else {
      const data = await res.json();
      showToast(data.error || 'Failed to update quantity.', 'error');
      if (originalCache) {
        localCartCache = originalCache;
        fetchAndRenderCart(localCartCache);
      }
    }
  } catch (err) {
    console.error(err);
    if (originalCache) {
      localCartCache = originalCache;
      fetchAndRenderCart(localCartCache);
    }
  }
}

async function deleteCartItem(cartId) {
  const originalCache = localCartCache ? JSON.parse(JSON.stringify(localCartCache)) : null;
  if (localCartCache) {
    localCartCache = localCartCache.filter(i => i.id !== cartId);
    fetchAndRenderCart(localCartCache);
    
    // Update badge count instantly
    const totalCount = localCartCache.reduce((sum, i) => sum + i.quantity, 0);
    const badges = document.querySelectorAll('nav .absolute, nav span.bg-secondary-container, nav span.bg-secondary');
    badges.forEach(badge => {
      if (totalCount > 0) {
        badge.textContent = totalCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    });
  }

  try {
    const res = await fetch(`/api/cart/${cartId}`, { method: 'DELETE' });
    if (res.ok) {
      const items = await res.json();
      localCartCache = items;
      fetchAndRenderCart(localCartCache);
    } else {
      showToast('Failed to remove cart item.', 'error');
      if (originalCache) {
        localCartCache = originalCache;
        fetchAndRenderCart(localCartCache);
      }
    }
  } catch (err) {
    console.error(err);
    if (originalCache) {
      localCartCache = originalCache;
      fetchAndRenderCart(localCartCache);
    }
  }
}

// ==========================================
// 5. LOGIN / SIGNUP PAGES
// ==========================================
function initLoginPage() {
  const form = document.querySelector('form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('identifier').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) {
      showToast('Email/Username and password are required.', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = (['owner', 'admin'].includes(data.user.role)) ? '/admin' : '/account';
      } else {
        showToast(data.error || 'Login failed.', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Redirect link wiring
  const signupLink = document.querySelector('main a');
  if (signupLink) signupLink.href = '/signup';
}

function initSignupPage() {
  const form = document.querySelector('form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = (document.getElementById('username') || document.getElementById('full_name')).value.trim().replace(/\s+/g, '_');
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !email || !password) {
      showToast('Username, email, and password are required.', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = '/account';
      } else {
        showToast(data.error || 'Registration failed.', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Redirect link wiring
  const loginLink = document.querySelector('main a');
  if (loginLink) loginLink.href = '/login';
}

// ==========================================
// 6. CUSTOMER DASHBOARD (/account)
// ==========================================
function initAccountPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const activeTab = urlParams.get('tab') || 'home';
  switchTab(activeTab);

  // Wire Tab Sidebar triggers
  const links = document.querySelectorAll('aside a');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = link.getAttribute('data-tab');
      if (tabName === 'logout') {
        logoutUser();
        return;
      }
      switchTab(tabName);
    });
  });

  // Fetch basic user profile info on dashboard home
  fetch('/api/me')
    .then(res => res.json())
    .then(data => {
      if (data.loggedIn) {
        document.getElementById('profile-username').textContent = `@${data.user.username}`;
        document.getElementById('profile-email').textContent = data.user.email;
        document.getElementById('edit-email-input').value = data.user.email;
        
        // Show Admin Dashboard link in the account page sidebar if they are the admin
        if (['owner', 'admin'].includes(data.user.role)) {
          const sidebarUl = document.querySelector('aside ul');
          if (sidebarUl && !document.querySelector('#admin-sidebar-link')) {
            const li = document.createElement('li');
            li.innerHTML = `<a id="admin-sidebar-link" class="font-body-md text-body-md text-error font-bold pl-3 border-l-2 border-transparent flex items-center gap-2 hover:text-secondary transition-colors" href="/admin"><span class="material-symbols-outlined text-sm text-error">settings_accessibility</span> Admin Dashboard</a>`;
            // Insert right before logout (which is the last li)
            sidebarUl.insertBefore(li, sidebarUl.lastElementChild);
          }
        }
      }
    });

  // Wire Address creation form
  const addressForm = document.getElementById('address-form');
  if (addressForm) {
    addressForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        full_name: document.getElementById('addr-name').value,
        phone: document.getElementById('addr-phone').value,
        address_line1: document.getElementById('addr-line1').value,
        address_line2: document.getElementById('addr-line2').value,
        city: document.getElementById('addr-city').value,
        state: document.getElementById('addr-state').value,
        postal_code: document.getElementById('addr-zip').value,
        is_default: document.getElementById('addr-default').checked ? 1 : 0
      };

      try {
        const res = await fetch('/api/addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast('Address saved!', 'success');
          addressForm.reset();
          loadSavedAddresses();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to save address.', 'error');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Wire Profile Editing
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('edit-email-input').value.trim();
      try {
        const res = await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        if (res.ok) {
          showToast('Profile successfully updated!', 'success');
          location.reload();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to update email.', 'error');
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  // Wire Security Settings change password
  const securityForm = document.getElementById('security-form');
  if (securityForm) {
    securityForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const current_password = document.getElementById('cur-pass').value;
      const new_password = document.getElementById('new-pass').value;
      try {
        const res = await fetch('/api/profile/security', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_password, new_password })
        });
        if (res.ok) {
          showToast('Password successfully updated!', 'success');
          securityForm.reset();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to update password.', 'error');
        }
      } catch (e) {
        console.error(e);
      }
    });
  }
}

function switchTab(tabName) {
  // Update sidebar active classes
  document.querySelectorAll('aside a').forEach(a => {
    if (a.getAttribute('data-tab') === tabName) {
      a.className = 'font-body-md text-body-md text-secondary font-semibold border-l-2 border-secondary pl-3 flex items-center gap-2';
    } else {
      a.className = 'font-body-md text-body-md text-on-surface-variant hover:text-secondary transition-colors pl-3 border-l-2 border-transparent flex items-center gap-2';
    }
  });

  // Toggle page visibility
  document.querySelectorAll('.tab-content').forEach(el => {
    el.style.display = 'none';
  });

  const activeContent = document.getElementById(`tab-${tabName}`);
  if (activeContent) {
    activeContent.style.display = 'block';
  }

  // Reload tab specific contents
  if (tabName === 'orders') {
    loadUserOrders();
  } else if (tabName === 'wishlist') {
    loadUserWishlist();
  } else if (tabName === 'addresses') {
    loadSavedAddresses();
  }
}

function logoutUser() {
  fetch('/api/logout', { method: 'POST' })
    .then(() => {
      window.location.href = '/login';
    });
}

function loadUserOrders() {
  const container = document.getElementById('orders-list');
  if (!container) return;

  fetch('/api/orders')
    .then(res => res.json())
    .then(orders => {
      container.innerHTML = '';
      if (orders.length === 0) {
        container.innerHTML = `<p class="text-on-surface-variant py-8 font-body-md text-center">You have not placed any orders yet.</p>`;
        return;
      }

      orders.forEach(o => {
        const orderDiv = document.createElement('div');
        orderDiv.className = 'border border-outline-variant p-6 rounded-lg bg-surface-container-lowest space-y-4';
        
        let itemsHtml = o.items.map(item => `
          <div class="flex gap-4 items-center">
            <div class="w-16 h-16 bg-surface-container rounded border overflow-hidden">
              <img src="${item.image_url}" class="w-full h-full object-cover" loading="lazy" />
            </div>
            <div class="flex-grow">
              <p class="font-bold text-on-surface font-label-md">${item.name} (US ${item.size})</p>
              <p class="text-sm text-on-surface-variant font-label-sm">${item.brand} x ${item.quantity}</p>
            </div>
            <p class="font-bold text-on-surface font-label-md">${formatINR(item.price * item.quantity)}</p>
          </div>
        `).join('');

        orderDiv.innerHTML = `
          <div class="flex flex-col md:flex-row justify-between border-b border-outline-variant pb-4 font-label-sm text-label-sm text-on-surface-variant gap-2">
            <div>
              <span>ORDER ID: <b class="text-on-surface font-bold">#${o.id}</b></span>
              <span class="mx-2">|</span>
              <span>DATE: <b class="text-on-surface font-bold">${new Date(o.created_at).toLocaleDateString()}</b></span>
            </div>
            <div>
              <span>STATUS: <span class="px-2 py-0.5 rounded-full ${o.status === 'Pending' ? 'bg-secondary-fixed text-on-secondary-fixed-variant' : 'bg-tertiary-fixed text-on-tertiary-fixed-variant'} font-bold">${o.status.toUpperCase()}</span></span>
            </div>
          </div>
          <div class="space-y-4">
            ${itemsHtml}
          </div>
          
          <!-- Shipment & Delivery Info -->
          <div class="border-t border-outline-variant pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-label-md">
            <div class="space-y-1">
              <p class="text-on-surface-variant uppercase tracking-wider font-bold text-[10px] mb-1">Shipment & Delivery</p>
              <p><span class="text-on-surface-variant">Courier Partner:</span> <strong>${escapeHtml(o.courier_name || 'Delhivery Logistics')}</strong></p>
              ${o.tracking_number && !o.tracking_number.startsWith('MG-') ? `
                <p><span class="text-on-surface-variant">Tracking Number:</span> <a href="https://track.delhivery.com/query?id=${escapeHtml(o.tracking_number)}" target="_blank" class="text-secondary underline font-mono font-bold">${escapeHtml(o.tracking_number)} ↗</a></p>
              ` : `
                <p><span class="text-on-surface-variant">Tracking:</span> <em>Pending Dispatch</em></p>
              `}
              <p><span class="text-on-surface-variant">Payment Method:</span> <strong>${escapeHtml(o.payment_method === 'COD' ? 'Cash on Delivery (COD)' : o.payment_method === 'UPI' ? 'UPI Gateway' : o.payment_method)}</strong></p>
            </div>
            <div class="space-y-1">
              <p class="text-on-surface-variant uppercase tracking-wider font-bold text-[10px] mb-1">Shipping Address</p>
              <p class="text-on-surface font-medium leading-relaxed">${o.shipping_address ? escapeHtml(o.shipping_address.replace(/Name:\s*([^,]+),\s*Email:\s*([^,]+),\s*Phone:\s*([^,]+),\s*/, '')) : 'N/A'}</p>
            </div>
          </div>

          ${o.shipping_notes ? `
          <div class="bg-secondary-fixed/5 border-l-4 border-secondary p-3 text-xs font-label-sm leading-relaxed mt-2 rounded">
            <strong class="text-secondary uppercase text-[10px] block mb-1">Updates / Notes from Courier</strong>
            <span class="text-on-surface">${escapeHtml(o.shipping_notes)}</span>
          </div>
          ` : ''}

          <div class="flex justify-between items-center border-t border-outline-variant pt-4">
            <span class="text-on-surface-variant font-label-md">Total Paid:</span>
            <div class="flex items-center gap-4">
              <a href="/order-invoice/${o.id}" target="_blank" class="px-4 py-2 border border-outline-variant font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors flex items-center gap-1.5 no-print">
                <span class="material-symbols-outlined text-sm">download</span> Invoice
              </a>
              <span class="font-headline-md text-headline-md text-secondary">${formatINR(o.total)}</span>
            </div>
          </div>
        `;
        container.appendChild(orderDiv);
      });
    });
}

function loadUserWishlist() {
  const container = document.getElementById('wishlist-grid');
  if (!container) return;

  fetch('/api/wishlist')
    .then(res => res.json())
    .then(items => {
      container.innerHTML = '';
      if (items.length === 0) {
        container.innerHTML = `<div class="col-span-full py-16 text-center text-on-surface-variant font-body-md">Your wishlist is empty.</div>`;
        return;
      }

      items.forEach(p => {
        const card = document.createElement('div');
        card.className = 'group border border-outline-variant bg-white p-6 relative rounded-lg';
        card.innerHTML = `
          <button class="absolute top-4 right-4 material-symbols-outlined text-outline hover:text-error remove-wish-btn" data-id="${p.product_id}">close</button>
          <div class="aspect-square bg-surface-container-low overflow-hidden rounded mb-4 cursor-pointer" onclick="window.location.href='/product/${p.slug}'">
            <img src="${p.image_url}" class="w-full h-full object-contain group-hover:scale-105 transition-transform" loading="lazy" />
          </div>
          <div class="space-y-2">
            <h4 class="font-bold text-on-surface uppercase font-label-md">${p.name}</h4>
            <p class="font-headline-md text-body-md text-secondary">${formatINR(p.price)}</p>
            <button class="w-full py-2 bg-secondary-container text-on-secondary font-label-md text-label-md hover:scale-105 transition-transform add-cart-wish" data-id="${p.product_id}">ADD TO BAG</button>
          </div>
        `;

        card.querySelector('.remove-wish-btn').addEventListener('click', () => {
          removeWishlistItem(p.product_id);
        });

        card.querySelector('.add-cart-wish').addEventListener('click', () => {
          addToCart(p.product_id, '10', 1);
        });

        container.appendChild(card);
      });
    });
}

async function removeWishlistItem(productId) {
  // Optimistically remove from DOM
  const btn = document.querySelector(`.remove-wish-btn[data-id="${productId}"]`);
  if (btn) {
    const card = btn.closest('.group');
    if (card) {
      card.style.transition = 'all 0.3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
      setTimeout(() => {
        card.remove();
        const container = document.getElementById('wishlist-grid');
        if (container && container.querySelectorAll('.group').length === 0) {
          container.innerHTML = `<div class="col-span-full py-16 text-center text-on-surface-variant font-body-md">Your wishlist is empty.</div>`;
        }
      }, 300);
    }
  }

  try {
    const res = await fetch(`/api/wishlist/${productId}`, { method: 'DELETE' });
    if (!res.ok) {
      showToast('Failed to remove item.', 'error');
      loadUserWishlist();
    }
  } catch (err) {
    console.error(err);
    loadUserWishlist();
  }
}

function loadSavedAddresses() {
  const list = document.getElementById('addresses-list');
  if (!list) return;

  fetch('/api/addresses')
    .then(res => res.json())
    .then(addr => {
      list.innerHTML = '';
      if (addr.length === 0) {
        list.innerHTML = `<p class="text-on-surface-variant font-body-md">No saved addresses.</p>`;
        return;
      }

      addr.forEach(a => {
        const card = document.createElement('div');
        card.className = 'border border-outline-variant p-6 rounded-lg relative space-y-2 bg-white';
        card.innerHTML = `
          ${a.is_default ? '<span class="px-2 py-0.5 bg-tertiary-fixed text-on-tertiary-fixed-variant text-[10px] font-bold rounded-full">DEFAULT</span>' : ''}
          <button class="absolute top-4 right-4 material-symbols-outlined text-outline hover:text-error delete-addr-btn" data-id="${a.id}">delete</button>
          <h4 class="font-bold text-on-surface font-label-md">${escapeHtml(a.full_name).toUpperCase()}</h4>
          <p class="text-sm text-on-surface-variant font-body-md">${escapeHtml(a.address_line1)}${a.address_line2 ? ', ' + escapeHtml(a.address_line2) : ''}</p>
          <p class="text-sm text-on-surface-variant font-body-md">${escapeHtml(a.city)}, ${escapeHtml(a.state)} - ${escapeHtml(a.postal_code)}</p>
          <p class="text-sm text-on-surface-variant font-body-md">Phone: ${escapeHtml(a.phone)}</p>
        `;

        card.querySelector('.delete-addr-btn').addEventListener('click', () => {
          deleteAddress(a.id);
        });

        list.appendChild(card);
      });
    });
}

async function deleteAddress(id) {
  try {
    const res = await fetch(`/api/addresses/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadSavedAddresses();
    } else {
      showToast('Failed to delete address.', 'error');
    }
  } catch (err) {
    console.error(err);
  }
}

// ==========================================
// 7. ADMIN DASHBOARD ROUTING & FUNCTIONS
// ==========================================
function initAdminPage() {
  const contentSection = document.querySelector('main');
  if (!contentSection) return;

  const sidebarLinks = document.querySelectorAll('nav [data-admin-tab]');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = link.getAttribute('data-admin-tab');
      
      // Update URL cleanly via pushState
      const path = tabName === 'overview' ? '/admin' : `/admin/${tabName}`;
      window.history.pushState(null, '', path);
      
      switchAdminTab(tabName);
    });
  });

  // Handle browser back/forward buttons
  window.addEventListener('popstate', () => {
    const activeTab = getTabFromUrl();
    switchAdminTab(activeTab, false);
  });

  // Initial Load based on URL path
  const initialTab = getTabFromUrl();
  switchAdminTab(initialTab, false);
}

function getTabFromUrl() {
  const path = window.location.pathname;
  if (path.includes('/products')) return 'products';
  if (path.includes('/orders')) return 'orders';
  if (path.includes('/customers')) return 'customers';
  if (path.includes('/categories')) return 'categories';
  if (path.includes('/settings')) return 'settings';
  if (path.includes('/team')) return 'team';
  if (path.includes('/analytics')) return 'overview';
  return 'overview';
}

function switchAdminTab(tab, updateNavState = true) {
  const contentDiv = document.querySelector('main');
  if (!contentDiv) return;

  // Normalize tab names
  if (tab === 'inventory') tab = 'products';
  if (tab === 'analytics') tab = 'overview';

  // Update navigation classes
  const sidebarLinks = document.querySelectorAll('nav [data-admin-tab]');
  sidebarLinks.forEach(l => {
    const t = l.getAttribute('data-admin-tab');
    if (t === tab) {
      l.className = 'text-secondary border-b-2 border-secondary pb-1 font-body-md transition-all cursor-pointer';
    } else {
      l.className = 'text-on-surface-variant hover:text-on-surface font-body-md transition-all cursor-pointer';
    }
  });

  if (tab === 'overview') {
    renderAdminOverview(contentDiv);
  } else if (tab === 'products') {
    renderAdminProducts(contentDiv);
  } else if (tab === 'orders') {
    renderAdminOrders(contentDiv);
  } else if (tab === 'customers') {
    renderAdminCustomers(contentDiv);
  } else if (tab === 'categories') {
    renderAdminCategories(contentDiv);
  } else if (tab === 'settings') {
    renderAdminSettings(contentDiv);
  } else if (tab === 'team') {
    renderAdminTeam(contentDiv);
  }
}

// 7.1. Admin Overview / Analytics Tab
function renderAdminOverview(contentDiv) {
  fetch('/api/admin/analytics')
    .then(res => res.json())
    .then(data => {
      contentDiv.innerHTML = `
        <header class="mb-12 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h1 class="font-display-lg text-display-lg text-on-surface mb-2">Command Center</h1>
            <p class="text-on-surface-variant font-body-lg">Real-time performance metrics and global logistics.</p>
          </div>
          <div class="flex gap-4 w-full sm:w-auto">
            <button class="px-6 py-3 border-2 border-outline-variant rounded-lg font-label-md text-on-surface hover:bg-surface-container-high transition-all flex items-center justify-center gap-2 flex-grow sm:flex-grow-0" onclick="showToast('Export completed.', 'success')">
              <span class="material-symbols-outlined">download</span> Export Report
            </button>
            <button class="px-6 py-3 bg-secondary-container text-on-secondary-container rounded-lg font-label-md hover:scale-105 transition-transform flex items-center justify-center gap-2 flex-grow sm:flex-grow-0" id="admin-create-drop-btn">
              <span class="material-symbols-outlined">add</span> Create Drop
            </button>
          </div>
        </header>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-gutter mb-12">
          <div class="col-span-1 md:col-span-2 bg-white border border-outline-variant p-8 relative overflow-hidden flex flex-col justify-between group">
            <div class="absolute top-0 right-0 w-32 h-32 bg-secondary-fixed/10 rounded-bl-full -mr-8 -mt-8"></div>
            <div>
              <span class="font-label-md text-label-md text-secondary uppercase tracking-widest mb-4 block">Gross Revenue</span>
              <h2 class="font-display-lg text-display-lg text-on-surface">${formatINR(data.revenue)}</h2>
            </div>
            <div class="mt-8 flex items-end justify-between">
              <div class="flex items-center gap-2 text-tertiary">
                <span class="material-symbols-outlined">trending_up</span>
                <span class="font-label-md">+14.2% from last drop</span>
              </div>
            </div>
          </div>
          <div class="bg-white border border-outline-variant p-8 flex flex-col justify-between">
            <div>
              <span class="font-label-md text-label-md text-on-surface-variant mb-4 block">Hype Meter</span>
              <div class="flex items-baseline gap-2">
                <span class="font-headline-lg text-headline-lg">${data.hype}</span>
                <span class="text-on-surface-variant font-label-md">%</span>
              </div>
            </div>
            <div class="mt-6 w-full h-2 bg-surface-container rounded-full overflow-hidden">
              <div class="h-full bg-secondary-container w-[93%]"></div>
            </div>
          </div>
          <div class="bg-white border border-outline-variant p-8 flex flex-col justify-between">
            <div>
              <span class="font-label-md text-label-md text-on-surface-variant mb-4 block">Active Sessions</span>
              <span class="font-headline-lg text-headline-lg">${data.sessions}</span>
            </div>
          </div>
        </div>

        <div id="dashboard-recent-row" class="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
          <div class="lg:col-span-2 bg-white border border-outline-variant p-8">
            <h3 class="font-headline-md text-headline-md mb-8">Active Inventory Overview</h3>
            <div class="overflow-x-auto" id="admin-recent-inventory"></div>
          </div>
          <div class="bg-white border border-outline-variant p-8 flex flex-col">
            <h3 class="font-headline-md text-headline-md mb-8">System Summary</h3>
            <ul class="space-y-4 font-label-md text-label-md">
              <li class="flex justify-between"><span>Total Products:</span><b>${data.products}</b></li>
              <li class="flex justify-between"><span>Total Customers:</span><b>${data.customers}</b></li>
              <li class="flex justify-between"><span>Total Orders:</span><b>${data.orders}</b></li>
            </ul>
          </div>
        </div>
      `;

      document.getElementById('admin-create-drop-btn').addEventListener('click', () => {
        window.history.pushState(null, '', '/admin/products');
        switchAdminTab('products');
      });

      // Load mini inventory
      fetch('/api/admin/products?page=1&limit=3')
        .then(res => res.json())
        .then(data => {
          const tableContainer = document.getElementById('admin-recent-inventory');
          if (!tableContainer) return;
          
          const prods = Array.isArray(data) ? data : (data.products || []);
          let rowsHtml = prods.slice(0, 3).map(p => `
            <tr>
              <td class="py-4 flex items-center gap-4">
                <div class="w-12 h-12 bg-surface-container rounded border border-outline-variant overflow-hidden">
                  <img src="${p.image_url}" class="w-full h-full object-contain" />
                </div>
                <span class="font-body-md font-semibold">${p.name}</span>
              </td>
              <td class="py-4 font-label-md text-on-surface-variant">${p.sku}</td>
              <td class="py-4 font-body-md">${p.stock}</td>
              <td class="py-4 text-right">
                <span class="px-3 py-1 ${p.stock > 5 ? 'bg-tertiary-fixed text-on-tertiary-fixed-variant' : 'bg-error-container text-on-error-container'} rounded-full font-label-sm">
                  ${p.stock > 5 ? 'Restocked' : 'Low Stock'}
                </span>
              </td>
            </tr>
          `).join('');

          tableContainer.innerHTML = `
            <table class="w-full text-left">
              <thead>
                <tr class="border-b border-outline-variant">
                  <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Product Name</th>
                  <th class="pb-4 font-label-md text-label-md text-on-surface-variant">SKU</th>
                  <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Stock</th>
                  <th class="pb-4 font-label-md text-label-md text-on-surface-variant text-right">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline-variant">
                ${rowsHtml}
              </tbody>
            </table>
          `;
        });
    });
}

// 7.2. Admin Products Management CRUD & Bulk Actions
function renderAdminProducts(container) {
  container.innerHTML = `
    <header class="mb-12 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
      <div>
        <h1 class="font-display-lg text-display-lg text-on-surface mb-2">Products Management</h1>
        <p class="text-on-surface-variant font-body-lg">Add, edit, delete, filter, or bulk update catalog products.</p>
      </div>
      <button class="px-6 py-3 bg-secondary text-white font-label-md hover:scale-105 transition-transform" id="admin-add-prod-btn">
        Add New Product
      </button>
    </header>
 
    <div id="product-form-container" class="mb-12 p-8 border border-outline-variant bg-white rounded-lg hidden"></div>
 
    <!-- Filters Strip -->
    <div class="bg-white border border-outline-variant p-6 mb-8 flex flex-col md:flex-row gap-6 items-center justify-between">
      <div class="flex flex-col md:flex-row gap-4 items-center w-full md:w-auto">
        <input type="text" id="admin-prod-search" class="w-full md:w-72 p-3 border rounded border-outline-variant font-label-sm" placeholder="Search product name, brand, SKU..." />
        <select id="admin-prod-filter-cat" class="w-full md:w-48 p-3 border rounded border-outline-variant font-label-sm">
          <option value="">All Categories</option>
        </select>
        <select id="admin-prod-filter-status" class="w-full md:w-40 p-3 border rounded border-outline-variant font-label-sm">
          <option value="">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Disabled Only</option>
        </select>
      </div>
      <div class="font-label-md text-label-md text-on-surface-variant" id="admin-prod-count">
        Showing 0 products
      </div>
    </div>
 
    <!-- Sticky Bulk Actions Drawer -->
    <div id="bulk-actions-drawer" class="fixed bottom-0 left-0 right-0 bg-inverse-surface text-inverse-on-surface py-4 px-margin-desktop shadow-2xl transition-all duration-300 transform translate-y-full z-50 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <span class="material-symbols-outlined text-secondary-fixed">checked_bag</span>
        <span class="font-headline-md text-body-md" id="bulk-selected-count">0 items selected</span>
      </div>
      <div class="flex gap-4">
        <button class="px-4 py-2 bg-secondary text-white font-label-md hover:bg-secondary/90 transition-colors" id="bulk-btn-enable">Bulk Enable</button>
        <button class="px-4 py-2 bg-outline text-white font-label-md hover:bg-outline/90 transition-colors" id="bulk-btn-disable">Bulk Disable</button>
        <button class="px-4 py-2 bg-error text-white font-label-md hover:bg-error/90 transition-colors" id="bulk-btn-delete">Bulk Delete</button>
        <button class="px-4 py-2 border border-outline text-inverse-on-surface font-label-md hover:bg-white/10 transition-colors" id="bulk-btn-cancel">Cancel</button>
      </div>
    </div>
 
    <div class="bg-white border border-outline-variant p-8">
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b border-outline-variant">
              <th class="pb-4 w-12 text-center">
                <input type="checkbox" id="admin-select-all-prods" class="w-5 h-5 border border-outline-variant text-secondary rounded-none cursor-pointer" />
              </th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Product</th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">SKU</th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Price</th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Stock</th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Status</th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant" id="admin-inventory-rows"></tbody>
        </table>
      </div>
      <div class="flex justify-between items-center mt-6 pt-4 border-t border-outline-variant" id="admin-prod-pagination">
        <button class="px-4 py-2 border border-outline-variant hover:bg-surface-container-high disabled:opacity-40 disabled:hover:bg-transparent font-label-md transition-colors" id="admin-prod-prev-btn" disabled>Previous</button>
        <span class="font-label-md text-on-surface-variant" id="admin-prod-page-num">Page 1 of 1</span>
        <button class="px-4 py-2 border border-outline-variant hover:bg-surface-container-high disabled:opacity-40 disabled:hover:bg-transparent font-label-md transition-colors" id="admin-prod-next-btn" disabled>Next</button>
      </div>
    </div>
  `;

  const rowsContainer = document.getElementById('admin-inventory-rows');
  const formContainer = document.getElementById('product-form-container');
  const searchInput = document.getElementById('admin-prod-search');
  const categoryFilter = document.getElementById('admin-prod-filter-cat');
  const statusFilter = document.getElementById('admin-prod-filter-status');
  const countText = document.getElementById('admin-prod-count');
  const selectAllCheckbox = document.getElementById('admin-select-all-prods');
  const bulkDrawer = document.getElementById('bulk-actions-drawer');
  const bulkSelectedCountText = document.getElementById('bulk-selected-count');

  let allProducts = [];
  let currentPage = 1;
  const itemsPerPage = 15;

  // Populate dynamic category dropdown options
  fetch('/api/categories')
    .then(res => res.json())
    .then(cats => {
      categoryFilter.innerHTML = '<option value="">All Categories</option>' +
        cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    });

  // Trigger Add product form
  document.getElementById('admin-add-prod-btn').addEventListener('click', () => {
    openProductForm(null);
  });

  // Load and render inventory
  function loadAndRenderProducts() {
    const searchVal = searchInput.value.trim();
    const catVal = categoryFilter.value;
    const statusVal = statusFilter.value;

    let url = `/api/admin/products?page=${currentPage}&limit=${itemsPerPage}`;
    if (searchVal) url += `&search=${encodeURIComponent(searchVal)}`;
    if (catVal) url += `&category=${encodeURIComponent(catVal)}`;
    if (statusVal) url += `&status=${encodeURIComponent(statusVal)}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        allProducts = data.products || [];
        const total = data.total || 0;
        const totalPages = data.pages || 1;

        countText.textContent = `Showing ${total} products`;
        rowsContainer.innerHTML = '';
        selectAllCheckbox.checked = false;
        updateBulkDrawerState();

        if (allProducts.length === 0) {
          rowsContainer.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-on-surface-variant font-body-md">No products found.</td></tr>`;
          document.getElementById('admin-prod-page-num').textContent = `Page 1 of 1`;
          document.getElementById('admin-prod-prev-btn').disabled = true;
          document.getElementById('admin-prod-next-btn').disabled = true;
          return;
        }

        // Update pagination controls UI
        document.getElementById('admin-prod-page-num').textContent = `Page ${currentPage} of ${totalPages}`;
        document.getElementById('admin-prod-prev-btn').disabled = currentPage === 1;
        document.getElementById('admin-prod-next-btn').disabled = currentPage === totalPages;

        allProducts.forEach(p => {
          const row = document.createElement('tr');
          row.className = 'hover:bg-surface-container-lowest transition-colors';
          row.innerHTML = `
            <td class="py-4 text-center">
              <input type="checkbox" class="prod-select-checkbox w-5 h-5 border border-outline-variant text-secondary rounded-none cursor-pointer" data-id="${p.id}" />
            </td>
            <td class="py-4 flex items-center gap-4">
              <div class="w-12 h-12 bg-surface-container rounded border border-outline-variant overflow-hidden">
                <img src="${p.image_url}" class="w-full h-full object-contain" />
              </div>
              <div>
                <span class="font-body-md font-semibold block">${p.name}</span>
                <span class="text-xs text-on-surface-variant uppercase">${p.category_name || 'Uncategorized'}</span>
              </div>
            </td>
            <td class="py-4 font-label-md text-on-surface-variant">${p.sku}</td>
            <td class="py-4 font-body-md font-semibold">${formatINR(p.price)}</td>
            <td class="py-4 font-body-md">${p.stock}</td>
            <td class="py-4">
              <span class="px-2 py-0.5 rounded-full text-xs font-bold ${p.enabled ? 'bg-tertiary-fixed text-on-tertiary-fixed-variant' : 'bg-outline-variant text-on-surface-variant'}">
                ${p.enabled ? 'ACTIVE' : 'DISABLED'}
              </span>
            </td>
            <td class="py-4 text-right space-x-2">
              <button class="px-3 py-1 bg-surface-container-high border border-outline-variant hover:bg-outline-variant text-sm font-bold edit-btn">EDIT</button>
              <button class="px-3 py-1 bg-error-container text-on-error-container hover:bg-error text-sm font-bold delete-btn">DELETE</button>
            </td>
          `;

          // Wire checkbox changes
          row.querySelector('.prod-select-checkbox').addEventListener('change', () => {
            updateBulkDrawerState();
          });

          // Wire Edit and Delete
          row.querySelector('.edit-btn').addEventListener('click', () => {
            openProductForm(p);
          });

          row.querySelector('.delete-btn').addEventListener('click', () => {
            showConfirm('Delete Product', `Are you sure you want to delete ${p.name}?`, () => {
              deleteProduct(p.id);
            });
          });

          rowsContainer.appendChild(row);
        });
      });
  }

  // Event Listeners for Filters (Resetting currentPage to 1)
  searchInput.addEventListener('input', debounce(() => {
    currentPage = 1;
    loadAndRenderProducts();
  }, 300));
  categoryFilter.addEventListener('change', () => {
    currentPage = 1;
    loadAndRenderProducts();
  });
  statusFilter.addEventListener('change', () => {
    currentPage = 1;
    loadAndRenderProducts();
  });

  // Wire up pagination click listeners
  document.getElementById('admin-prod-prev-btn').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadAndRenderProducts();
    }
  });

  document.getElementById('admin-prod-next-btn').addEventListener('click', () => {
    currentPage++;
    loadAndRenderProducts();
  });

  // Bulk select all checkbox
  selectAllCheckbox.addEventListener('change', () => {
    const checkboxes = rowsContainer.querySelectorAll('.prod-select-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
    updateBulkDrawerState();
  });

  function getSelectedProductIds() {
    const checkboxes = rowsContainer.querySelectorAll('.prod-select-checkbox:checked');
    return Array.from(checkboxes).map(cb => Number(cb.getAttribute('data-id')));
  }

  function updateBulkDrawerState() {
    const selectedIds = getSelectedProductIds();
    const count = selectedIds.length;
    if (count > 0) {
      bulkDrawer.classList.remove('translate-y-full');
      bulkSelectedCountText.textContent = `${count} product${count > 1 ? 's' : ''} selected`;
    } else {
      bulkDrawer.classList.add('translate-y-full');
    }
  }

  // Bulk Drawer Actions
  document.getElementById('bulk-btn-cancel').addEventListener('click', () => {
    const checkboxes = rowsContainer.querySelectorAll('.prod-select-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    selectAllCheckbox.checked = false;
    updateBulkDrawerState();
  });

  async function handleBulkAction(action) {
    const ids = getSelectedProductIds();
    if (ids.length === 0) return;
    const executeAction = async () => {
      try {
        const res = await fetch('/api/admin/products/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ids })
        });
        if (res.ok) {
          showToast('Bulk action successfully processed.', 'success');
          loadAndRenderProducts();
        } else {
          const data = await res.json().catch(() => ({}));
          if (res.status === 403 && data.error === 'sudo_required') {
            promptSudo(executeAction);
          } else {
            showToast(data.error || 'Failed to execute bulk action.', 'error');
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    if (action === 'delete') {
      showConfirm('Delete Products', `Are you sure you want to delete ${ids.length} selected products?`, executeAction);
    } else {
      executeAction();
    }
  }

  document.getElementById('bulk-btn-enable').addEventListener('click', () => handleBulkAction('enable'));
  document.getElementById('bulk-btn-disable').addEventListener('click', () => handleBulkAction('disable'));
  document.getElementById('bulk-btn-delete').addEventListener('click', () => handleBulkAction('delete'));

  // Open Add/Edit product form
  function openProductForm(p) {
    formContainer.classList.remove('hidden');
    formContainer.scrollIntoView({ behavior: 'smooth' });

    Promise.all([
      fetch('/api/categories').then(res => res.json()),
      fetch('/api/sections').then(res => res.json())
    ]).then(([cats, sections]) => {
      const catOptions = cats.map(c => `
        <option value="${c.id}" ${p && p.category_id === c.id ? 'selected' : ''}>${c.name}</option>
      `).join('');

      const secOptions = `<option value="">None / Default</option>` + sections.map(s => `
        <option value="${s.id}" ${p && p.section_id === s.id ? 'selected' : ''}>${s.name}</option>
      `).join('');

      // Setup per-size inventory options (6-12)
      const allSizes = ['6', '7', '8', '9', '10', '11', '12'];
      const sizeInventoryHtml = allSizes.map(sz => {
        let sizeStock = 0;
        let isChecked = false;
        if (p && p.size_inventory) {
          const matched = p.size_inventory.find(si => String(si.size) === sz);
          if (matched) {
            sizeStock = matched.stock;
            isChecked = true;
          }
        } else if (!p) {
          if (['8', '9', '10'].includes(sz)) {
            sizeStock = 5;
            isChecked = true;
          }
        }
        
        return `
          <div class="flex items-center gap-3 border border-outline-variant p-3 bg-white size-row">
            <input type="checkbox" class="w-5 h-5 accent-secondary size-check" data-size="${sz}" ${isChecked ? 'checked' : ''} />
            <span class="w-8 font-bold">US ${sz}</span>
            <input type="number" class="w-20 p-1 border rounded border-outline-variant text-center size-stock-input" value="${sizeStock}" min="0" ${isChecked ? '' : 'disabled'} />
          </div>
        `;
      }).join('');

      // Setup multi-images list
      let uploadedImages = [];
      if (p && p.images && p.images.length > 0) {
        uploadedImages = JSON.parse(JSON.stringify(p.images));
      } else if (p && p.image_url) {
        uploadedImages = [{ url: p.image_url, is_primary: 1 }];
      }

      formContainer.innerHTML = `
        <h3 class="font-headline-md text-headline-md mb-6">${p ? 'Edit Product' : 'Add New Product'}</h3>
        <form id="product-crud-form" class="grid grid-cols-1 md:grid-cols-2 gap-6 font-label-md text-label-md">
          <div>
            <label class="block mb-2">Product Name *</label>
            <input type="text" id="p-name" class="w-full p-3 border rounded border-outline-variant" value="${p ? p.name : ''}" required />
          </div>
          <div>
            <label class="block mb-2">Brand *</label>
            <input type="text" id="p-brand" class="w-full p-3 border rounded border-outline-variant" value="${p ? p.brand : ''}" required />
          </div>
          <div>
            <label class="block mb-2">SKU *</label>
            <input type="text" id="p-sku" class="w-full p-3 border rounded border-outline-variant" value="${p ? p.sku : ''}" required />
          </div>
          <div>
            <label class="block mb-2">Price (INR ₹) *</label>
            <input type="number" id="p-price" class="w-full p-3 border rounded border-outline-variant" value="${p ? p.price : ''}" required />
          </div>
          <div>
            <label class="block mb-2">Category *</label>
            <select id="p-category" class="w-full p-3 border rounded border-outline-variant">
              ${catOptions}
            </select>
          </div>
          <div>
            <label class="block mb-2">Store Section</label>
            <select id="p-section" class="w-full p-3 border rounded border-outline-variant">
              ${secOptions}
            </select>
          </div>

          <div class="md:col-span-2">
            <label class="block mb-2 font-bold">Sizes & Inventory Stock</label>
            <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 bg-surface-container-low p-4 rounded border border-outline-variant" id="size-inventory-grid">
              ${sizeInventoryHtml}
            </div>
          </div>

          <div>
            <label class="block mb-2">Total Stock (Calculated)</label>
            <input type="number" id="p-stock" class="w-full p-3 border rounded border-outline-variant bg-surface-container-high cursor-not-allowed" value="${p ? p.stock : '15'}" readonly />
          </div>

          <div class="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 bg-surface-container-low p-4 rounded border border-outline-variant">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="p-featured" class="w-5 h-5 border border-outline-variant text-secondary rounded-none" ${p && p.is_featured ? 'checked' : ''} />
              <span>Featured</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="p-new" class="w-5 h-5 border border-outline-variant text-secondary rounded-none" ${p && p.is_new_arrival ? 'checked' : ''} />
              <span>New Arrival</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="p-limited" class="w-5 h-5 border border-outline-variant text-secondary rounded-none" ${p && p.is_limited_edition ? 'checked' : ''} />
              <span>Limited Ed.</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="p-enabled" class="w-5 h-5 border border-outline-variant text-secondary rounded-none" ${!p || p.enabled ? 'checked' : ''} />
              <span>Active</span>
            </label>
          </div>
          <div class="md:col-span-2">
            <label class="block mb-2">Description</label>
            <textarea id="p-description" class="w-full p-3 border rounded border-outline-variant h-24">${p ? p.description : ''}</textarea>
          </div>

          <!-- Multi-Image Upload and Gallery Reordering Manager -->
          <div class="md:col-span-2 border-t border-outline-variant pt-6">
            <label class="block mb-2 font-bold">Product Gallery Images Manager</label>
            
            <div id="image-dropzone" class="border-2 border-dashed border-outline-variant rounded-lg p-6 flex flex-col items-center justify-center gap-4 bg-surface-container-lowest cursor-pointer hover:border-secondary hover:bg-surface-container-low transition-all mb-4">
              <span class="material-symbols-outlined text-4xl text-outline">cloud_upload</span>
              <div class="text-center">
                <p class="font-body-md font-bold">Drag & drop or <span class="text-secondary font-extrabold underline">browse</span> to upload product image(s)</p>
                <p class="text-label-sm text-on-surface-variant mt-1">Supports multiple image uploads (Max 5MB each)</p>
              </div>
              <input type="file" id="image-file-input" class="hidden" accept="image/*" multiple />
            </div>
            
            <div id="image-manager-list" class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 p-4 border border-outline-variant bg-surface-container-low rounded">
              <!-- Dynamic Image Cards Injected here -->
            </div>
          </div>
          
          <div class="flex gap-4 md:col-span-2">
            <button type="submit" class="px-6 py-3 bg-secondary text-white font-bold uppercase tracking-wider font-headline-md text-sm">Save Changes</button>
            <button type="button" class="px-6 py-3 border border-outline-variant uppercase tracking-wider font-headline-md text-sm" id="form-cancel-btn">Cancel</button>
          </div>
        </form>
      `;

      // Set up Size stock inventory listener calculations
      const sizeRows = formContainer.querySelectorAll('.size-row');
      const totalStockInput = document.getElementById('p-stock');
      
      const updateTotalStock = () => {
        let total = 0;
        sizeRows.forEach(row => {
          const check = row.querySelector('.size-check');
          const input = row.querySelector('.size-stock-input');
          if (check.checked) {
            total += parseInt(input.value) || 0;
          }
        });
        totalStockInput.value = total;
      };

      sizeRows.forEach(row => {
        const check = row.querySelector('.size-check');
        const input = row.querySelector('.size-stock-input');
        
        check.addEventListener('change', () => {
          input.disabled = !check.checked;
          if (!check.checked) {
            input.value = 0;
          } else if (parseInt(input.value) === 0) {
            input.value = 5;
          }
          updateTotalStock();
        });
        
        input.addEventListener('input', updateTotalStock);
      });

      // Render Image manager items
      const renderImageManager = () => {
        const list = document.getElementById('image-manager-list');
        if (!list) return;
        list.innerHTML = '';
        
        if (uploadedImages.length === 0) {
          list.innerHTML = `<p class="col-span-full text-xs text-on-surface-variant italic py-2 text-center">No images uploaded yet.</p>`;
          return;
        }
        
        uploadedImages.forEach((img, idx) => {
          const card = document.createElement('div');
          card.className = `flex flex-col items-center p-3 border rounded bg-white relative gap-2 group ${img.is_primary ? 'border-2 border-secondary bg-surface-container-low' : 'border-outline-variant'}`;
          card.innerHTML = `
            <img src="${img.url}" class="w-20 h-20 object-contain border border-outline-variant bg-surface-container-lowest" />
            <label class="flex items-center gap-1.5 cursor-pointer text-xs font-bold mt-1">
              <input type="radio" name="primary_image_selection" class="accent-secondary" ${img.is_primary ? 'checked' : ''} />
              <span>Primary</span>
            </label>
            <div class="flex gap-1.5 mt-1 no-print">
              <button type="button" class="w-6 h-6 flex items-center justify-center border border-outline-variant hover:bg-surface-container-high rounded text-xs move-up-btn" title="Move Left" ${idx === 0 ? 'disabled opacity-30' : ''}>
                <span class="material-symbols-outlined text-sm">arrow_back</span>
              </button>
              <button type="button" class="w-6 h-6 flex items-center justify-center border border-outline-variant hover:bg-surface-container-high rounded text-xs move-down-btn" title="Move Right" ${idx === uploadedImages.length - 1 ? 'disabled opacity-30' : ''}>
                <span class="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
              <button type="button" class="w-6 h-6 flex items-center justify-center border border-error text-error hover:bg-error-container/20 rounded text-xs delete-img-btn" title="Delete Image">
                <span class="material-symbols-outlined text-sm">delete</span>
              </button>
            </div>
          `;
          
          card.querySelector('input[type="radio"]').addEventListener('change', () => {
            uploadedImages.forEach((x, i) => x.is_primary = (i === idx ? 1 : 0));
            renderImageManager();
          });
          
          card.querySelector('.move-up-btn').addEventListener('click', () => {
            if (idx > 0) {
              const temp = uploadedImages[idx];
              uploadedImages[idx] = uploadedImages[idx - 1];
              uploadedImages[idx - 1] = temp;
              renderImageManager();
            }
          });
          
          card.querySelector('.move-down-btn').addEventListener('click', () => {
            if (idx < uploadedImages.length - 1) {
              const temp = uploadedImages[idx];
              uploadedImages[idx] = uploadedImages[idx + 1];
              uploadedImages[idx + 1] = temp;
              renderImageManager();
            }
          });
          
          card.querySelector('.delete-img-btn').addEventListener('click', () => {
            const wasPrimary = img.is_primary;
            uploadedImages.splice(idx, 1);
            if (wasPrimary && uploadedImages.length > 0) {
              uploadedImages[0].is_primary = 1;
            }
            renderImageManager();
          });
          
          list.appendChild(card);
        });
      };

      // Set up Drag & Drop and Upload logic
      const dropzone = document.getElementById('image-dropzone');
      const fileInput = document.getElementById('image-file-input');

      renderImageManager();

      dropzone.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files.length > 0) {
          for (let i = 0; i < e.target.files.length; i++) {
            await uploadProductImage(e.target.files[i]);
          }
          fileInput.value = '';
        }
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropzone.classList.add('border-secondary', 'bg-surface-container-low');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropzone.classList.remove('border-secondary', 'bg-surface-container-low');
        }, false);
      });

      dropzone.addEventListener('drop', async (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            await uploadProductImage(files[i]);
          }
        }
      });

      async function uploadProductImage(file) {
        dropzone.style.opacity = '0.5';
        dropzone.style.pointerEvents = 'none';
        
        const formData = new FormData();
        formData.append('image', file);

        try {
          const res = await fetch('/api/admin/upload', {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (res.ok && data.success) {
            const isFirst = uploadedImages.length === 0;
            uploadedImages.push({
              url: data.url,
              is_primary: isFirst ? 1 : 0
            });
            renderImageManager();
            showToast(`Uploaded: ${file.name}`, 'success');
          } else {
            showToast(data.error || 'Failed to upload image.', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast('An error occurred during image upload.', 'error');
        } finally {
          dropzone.style.opacity = '1';
          dropzone.style.pointerEvents = 'auto';
        }
      }

      document.getElementById('form-cancel-btn').addEventListener('click', () => {
        formContainer.classList.add('hidden');
      });

      document.getElementById('product-crud-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (uploadedImages.length === 0) {
          showToast('Product image is required. Please upload at least one image.', 'warning');
          return;
        }

        // Ensure at least one image is primary
        if (!uploadedImages.some(img => img.is_primary === 1)) {
          uploadedImages[0].is_primary = 1;
        }

        const sizeInventory = Array.from(sizeRows).filter(row => row.querySelector('.size-check').checked).map(row => ({
          size: row.querySelector('.size-check').dataset.size,
          stock: parseInt(row.querySelector('.size-stock-input').value) || 0
        }));

        const sizes = sizeInventory.map(si => si.size);

        const payload = {
          name: document.getElementById('p-name').value.trim(),
          brand: document.getElementById('p-brand').value.trim(),
          sku: document.getElementById('p-sku').value.trim(),
          price: parseFloat(document.getElementById('p-price').value),
          category_id: parseInt(document.getElementById('p-category').value),
          section_id: document.getElementById('p-section').value ? parseInt(document.getElementById('p-section').value) : null,
          stock: parseInt(totalStockInput.value),
          description: document.getElementById('p-description').value.trim(),
          images: uploadedImages,
          size_inventory: sizeInventory,
          sizes: sizes,
          colors: ["Orange", "Black", "White"],
          is_featured: document.getElementById('p-featured').checked ? 1 : 0,
          is_new_arrival: document.getElementById('p-new').checked ? 1 : 0,
          is_limited_edition: document.getElementById('p-limited').checked ? 1 : 0,
          is_resale: 0,
          enabled: document.getElementById('p-enabled').checked ? 1 : 0
        };

        const url = p ? `/api/admin/products/${p.id}` : '/api/admin/products';
        const method = p ? 'PUT' : 'POST';

        try {
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            showToast('Product details successfully saved.', 'success');
            formContainer.classList.add('hidden');
            loadAndRenderProducts();
          } else {
            const err = await res.json();
            showToast(err.error || 'Failed to save product details.', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast('Network error while saving product.', 'error');
        }
      });
    }).catch(err => {
      console.error(err);
      showToast('Failed to load categories/sections.', 'error');
    });
  }

  async function deleteProduct(id) {
    try {
      const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Product deleted.', 'success');
        loadAndRenderProducts();
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403 && data.error === 'sudo_required') {
          promptSudo(() => deleteProduct(id));
        } else {
          showToast(data.error || 'Failed to delete product.', 'error');
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  loadAndRenderProducts();
}

// 7.3. Admin Orders Management
function renderAdminOrders(container) {
  let currentPage = 1;
  const itemsPerPage = 15;
  let allOrders = [];

  container.innerHTML = `
    <header class="mb-12">
      <h1 class="font-display-lg text-display-lg text-on-surface mb-2">Order Management</h1>
      <p class="text-on-surface-variant font-body-lg">View system transaction entries and adjust dispatch status.</p>
    </header>

    <div class="bg-white border border-outline-variant p-8">
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b border-outline-variant">
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Order ID</th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Customer</th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Tracking No</th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Total Paid</th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Status</th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant" id="admin-orders-rows"></tbody>
        </table>
      </div>
      <div class="flex justify-between items-center mt-6 pt-4 border-t border-outline-variant" id="admin-orders-pagination">
        <button class="px-4 py-2 border border-outline-variant hover:bg-surface-container-high disabled:opacity-40 disabled:hover:bg-transparent font-label-md transition-colors" id="admin-orders-prev-btn" disabled>Previous</button>
        <span class="font-label-md text-on-surface-variant" id="admin-orders-page-num">Page 1 of 1</span>
        <button class="px-4 py-2 border border-outline-variant hover:bg-surface-container-high disabled:opacity-40 disabled:hover:bg-transparent font-label-md transition-colors" id="admin-orders-next-btn" disabled>Next</button>
      </div>
    </div>
  `;

  // Address parsing helper
  function parseShippingAddress(addressStr) {
    const info = {
      name: '',
      email: '',
      phone: '',
      locality: '',
      state: '',
      pincode: '',
      fullAddress: addressStr
    };
    if (!addressStr) return info;
    const nameMatch = addressStr.match(/Name:\s*([^,]+)/);
    const emailMatch = addressStr.match(/Email:\s*([^,]+)/);
    const phoneMatch = addressStr.match(/Phone:\s*([^,]+)/);
    const localityMatch = addressStr.match(/Locality:\s*([^,]+)/);
    const stateMatch = addressStr.match(/State:\s*([^,]+)/);
    const pincodeMatch = addressStr.match(/Pincode:\s*([^,]+)/);
    if (nameMatch) info.name = nameMatch[1].trim();
    if (emailMatch) info.email = emailMatch[1].trim();
    if (phoneMatch) info.phone = phoneMatch[1].trim();
    if (localityMatch) info.locality = localityMatch[1].trim();
    if (stateMatch) info.state = stateMatch[1].trim();
    if (pincodeMatch) info.pincode = pincodeMatch[1].trim();
    return info;
  }

  // Update order status API helper
  async function updateOrderStatus(orderId, newStatus) {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        showToast('Order status successfully updated.', 'success');
        renderAdminOrders(container);
      } else {
        showToast('Failed to update order status.', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  }

  function openOrderDetailsModal(order) {
    let modal = document.getElementById('order-details-modal');
    if (modal) modal.remove();

    const addrInfo = parseShippingAddress(order.shipping_address);
    const displayName = escapeHtml(addrInfo.name || order.username || 'Customer');
    const displayEmail = escapeHtml(addrInfo.email || order.email || 'N/A');
    const displayPhone = escapeHtml(addrInfo.phone || 'N/A');
    const displayAddress = addrInfo.locality 
      ? `${escapeHtml(addrInfo.locality)}, ${escapeHtml(addrInfo.state)} - ${escapeHtml(addrInfo.pincode)}` 
      : escapeHtml(order.shipping_address);

    modal = document.createElement('div');
    modal.id = 'order-details-modal';
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
    
    // Status tracking visual timeline steps
    const statuses = ['Pending', 'Packed', 'Shipped', 'In Transit', 'Delivered'];
    const currentStatusIndex = statuses.indexOf(order.status);
    
    const timelineStepsHtml = statuses.map((st, idx) => {
      const isCompleted = idx <= currentStatusIndex && order.status !== 'Cancelled';
      const isCurrent = idx === currentStatusIndex && order.status !== 'Cancelled';
      return `
        <div class="flex-1 flex flex-col items-center relative step-node">
          <!-- Line -->
          ${idx > 0 ? `<div class="absolute right-[50%] top-4 translate-y-[-50%] w-full h-[3px] -z-10 ${idx <= currentStatusIndex ? 'bg-secondary' : 'bg-outline-variant'}"></div>` : ''}
          <!-- Dot -->
          <div class="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs ${
            isCurrent ? 'bg-secondary border-secondary text-white ring-4 ring-secondary/20' :
            isCompleted ? 'bg-secondary border-secondary text-white' : 'bg-white border-outline-variant text-on-surface-variant'
          }">
            ${idx + 1}
          </div>
          <!-- Label -->
          <span class="text-[10px] font-bold mt-2 uppercase tracking-wider text-center ${isCompleted ? 'text-secondary font-black' : 'text-on-surface-variant'}">${st}</span>
        </div>
      `;
    }).join('');

    modal.innerHTML = `
      <div class="bg-white max-w-4xl w-full border border-outline-variant shadow-2xl flex flex-col max-h-[90vh] relative animate-fade-in">
        <!-- Modal Header -->
        <div class="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
          <div>
            <h2 class="font-headline-md text-headline-md uppercase tracking-tight">Order Details #${order.id}</h2>
            <p class="font-label-sm text-label-sm text-on-surface-variant mt-1">Placed on ${new Date(order.created_at).toLocaleString()}</p>
          </div>
          <button id="order-details-close-x" class="text-on-surface-variant hover:text-on-surface">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Modal Body (Scrollable) -->
        <div class="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          
          <!-- Visual Timeline progress -->
          <div class="p-4 bg-surface-container-low border border-outline-variant rounded">
            <h3 class="font-headline-md text-[14px] uppercase tracking-widest text-secondary mb-4 text-center">Fulfillment Lifecycle</h3>
            <div class="flex items-center justify-between relative z-10 px-4">
              ${timelineStepsHtml}
            </div>
            ${order.status === 'Cancelled' ? `
              <div class="mt-4 text-center bg-error/10 border border-error/20 p-2 rounded text-error text-xs font-bold uppercase tracking-widest">
                ORDER CANCELLED / REFUNDED
              </div>
            ` : ''}
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-surface-container-lowest p-4 rounded border border-outline-variant">
            <div>
              <h3 class="font-headline-md text-[16px] uppercase tracking-widest text-secondary mb-3">Customer Information</h3>
              <div class="space-y-1 text-body-md">
                <p><span class="text-on-surface-variant font-bold">Name:</span> <strong>${displayName}</strong></p>
                <p><span class="text-on-surface-variant font-bold">Email:</span> <strong>${displayEmail}</strong></p>
                <p><span class="text-on-surface-variant font-bold">Phone:</span> <strong>${displayPhone}</strong></p>
              </div>
            </div>
            <div>
              <h3 class="font-headline-md text-[16px] uppercase tracking-widest text-secondary mb-3">Shipping Address</h3>
              <p class="text-body-md font-semibold">${displayAddress}</p>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-surface-container-low rounded border border-outline-variant text-center">
            <div>
              <span class="block text-label-sm text-on-surface-variant font-bold">COURIER PARTNER</span>
              <span class="font-bold text-body-md text-secondary uppercase block mt-1">${escapeHtml(order.courier_name || 'Delhivery Logistics')}</span>
            </div>
            <div>
              <span class="block text-label-sm text-on-surface-variant font-bold">TRACKING NUMBER</span>
              <span class="font-mono font-bold text-body-md text-secondary block mt-1">${escapeHtml(order.tracking_number)}</span>
            </div>
            <div>
              <span class="block text-label-sm text-on-surface-variant font-bold">PAYMENT METHOD</span>
              <span class="font-bold text-body-md text-secondary uppercase block mt-1">${escapeHtml(order.payment_method || 'Online Payment')}</span>
            </div>
            <div>
              <span class="block text-label-sm text-on-surface-variant font-bold">TOTAL PAID</span>
              <span class="font-bold text-body-md text-secondary block mt-1">${formatINR(order.total)}</span>
            </div>
          </div>

          <!-- Products Ordered List -->
          <div>
            <h3 class="font-headline-md text-[18px] uppercase mb-4 border-b border-outline-variant pb-2">Products Ordered</h3>
            <div class="space-y-4 max-h-[25vh] overflow-y-auto custom-scrollbar pr-2">
              ${order.items.map(item => `
                <div class="flex gap-4 p-3 bg-white border border-outline-variant rounded hover:shadow-sm transition-shadow">
                  <div class="w-16 h-16 bg-surface-container-low overflow-hidden flex-shrink-0">
                    <img src="${item.image_url}" class="w-full h-full object-contain" />
                  </div>
                  <div class="flex-1 flex flex-col sm:flex-row sm:justify-between sm:items-center">
                    <div>
                      <h4 class="font-headline-md text-body-md uppercase">${item.name}</h4>
                      <p class="text-label-sm text-on-surface-variant font-bold">BRAND: ${item.brand.toUpperCase()} | SIZE: US ${item.size}</p>
                    </div>
                    <div class="text-right sm:text-left mt-2 sm:mt-0 font-label-md">
                      <p>${item.quantity} x ${formatINR(item.price)}</p>
                      <p class="font-bold text-secondary text-body-md">${formatINR(item.quantity * item.price)}</p>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Price Breakdown Summary -->
          <div class="bg-surface-container-low p-4 rounded border border-outline-variant space-y-2">
            <div class="flex justify-between text-body-md">
              <span class="text-on-surface-variant font-bold">Subtotal</span>
              <span>${formatINR(order.subtotal)}</span>
            </div>
            ${order.promo_code ? `
              <div class="flex justify-between text-body-md text-tertiary">
                <span class="font-bold">Promo Code Applied (${order.promo_code})</span>
                <span>- ${formatINR(order.subtotal - order.total / 1.18)}</span>
              </div>
            ` : ''}
            <div class="flex justify-between text-body-md">
              <span class="text-on-surface-variant font-bold">Estimated Tax (18% GST)</span>
              <span>${formatINR(order.tax)}</span>
            </div>
            <div class="flex justify-between text-body-md">
              <span class="text-on-surface-variant font-bold">Shipping</span>
              <span class="text-tertiary">FREE</span>
            </div>
            <div class="flex justify-between text-headline-md border-t border-outline-variant pt-2">
              <span class="font-bold">Final Total</span>
              <span class="text-secondary">${formatINR(order.total)}</span>
            </div>
          </div>

          <!-- Internal Shipment Notes Banner -->
          <div class="p-4 bg-secondary-fixed/10 border-l-4 border-secondary rounded flex flex-col gap-1">
            <span class="font-bold uppercase tracking-wider text-[11px] text-secondary">Internal Shipment Notes (Visible to Customer)</span>
            <p class="text-sm text-on-surface font-label-md" id="modal-notes-display">${order.shipping_notes ? escapeHtml(order.shipping_notes) : 'No shipping notes added yet.'}</p>
          </div>

          <!-- Expose Editable Logistics and Update Timeline form -->
          <div class="bg-surface-container-lowest p-4 rounded border border-outline-variant space-y-4">
            <h3 class="font-headline-md text-[16px] uppercase tracking-widest text-secondary border-b border-outline-variant pb-2">Logistics & Dispatch Updater</h3>
            <form id="order-update-form" class="grid grid-cols-1 sm:grid-cols-3 gap-4 font-label-md text-label-md">
              <div>
                <label class="block mb-1 text-on-surface-variant text-label-sm">Courier Partner</label>
                <input type="text" id="edit-courier" class="w-full p-2 border rounded border-outline-variant" value="${escapeHtml(order.courier_name || 'Delhivery Logistics')}" />
              </div>
              <div>
                <label class="block mb-1 text-on-surface-variant text-label-sm">Tracking Number</label>
                <input type="text" id="edit-tracking" class="w-full p-2 border rounded border-outline-variant" value="${escapeHtml(order.tracking_number || '')}" />
              </div>
              <div>
                <label class="block mb-1 text-on-surface-variant text-label-sm">Order Status</label>
                <select id="edit-status" class="w-full p-2.5 border rounded border-outline-variant">
                  <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
                  <option value="Packed" ${order.status === 'Packed' ? 'selected' : ''}>Packed</option>
                  <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                  <option value="In Transit" ${order.status === 'In Transit' ? 'selected' : ''}>In Transit</option>
                  <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                  <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
              </div>
              <div class="sm:col-span-3">
                <label class="block mb-1 text-on-surface-variant text-label-sm">Edit Internal Shipment Notes (Visible to Customer)</label>
                <textarea id="edit-shipping-notes" class="w-full p-2 border rounded border-outline-variant h-16" placeholder="Add specific shipping/delivery notes (e.g. customer requests evening delivery)...">${escapeHtml(order.shipping_notes || '')}</textarea>
              </div>
              <div class="sm:col-span-3">
                <label class="block mb-1 text-on-surface-variant text-label-sm">Custom Notification Message (sent to customer by Email/WhatsApp)</label>
                <textarea id="edit-status-message" class="w-full p-2 border rounded border-outline-variant h-24" placeholder="e.g. Package has been handed over to Delhivery logistics in Mumbai sorting hub..."></textarea>
              </div>
              <div class="sm:col-span-3 flex justify-end">
                <button type="submit" class="px-6 py-2.5 bg-secondary text-white hover:bg-secondary/90 transition-colors uppercase tracking-wider font-bold">
                  Save Logistics & Update Status
                </button>
              </div>
            </form>
          </div>

          <!-- Notification Logs Audit Section -->
          <div>
            <h3 class="font-headline-md text-[18px] uppercase mb-4 border-b border-outline-variant pb-2">Audit Logs & History Timeline</h3>
            <div id="modal-notification-logs" class="space-y-3 max-h-[25vh] overflow-y-auto custom-scrollbar text-label-sm">
              <p class="text-on-surface-variant italic">Loading audit trail...</p>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="p-6 border-t border-outline-variant bg-surface-container-low flex justify-between items-center gap-4">
          <button id="order-details-invoice-btn" class="px-6 py-2 border border-secondary text-secondary hover:bg-secondary/10 transition-colors font-headline-md text-body-md uppercase tracking-wider flex items-center gap-2">
            <span class="material-symbols-outlined text-sm">print</span> Print GST Invoice
          </button>
          <button id="order-details-close-btn" class="px-6 py-2 border border-outline-variant hover:bg-surface-container transition-colors font-headline-md text-body-md uppercase tracking-wider">
            Close
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => {
      modal.remove();
    };

    document.getElementById('order-details-close-x').addEventListener('click', closeModal);
    document.getElementById('order-details-close-btn').addEventListener('click', closeModal);

    // Setup Dynamic Pre-filled message templates
    const statusSelect = document.getElementById('edit-status');
    const msgTextarea = document.getElementById('edit-status-message');
    
    const updateDefaultMessage = () => {
      const selectedStatus = statusSelect.value;
      const customerName = displayName;
      const orderId = order.id;
      const courier = document.getElementById('edit-courier').value.trim() || 'Delhivery Logistics';
      const tracking = document.getElementById('edit-tracking').value.trim() || 'MG-Pending';

      let msg = "";
      if (selectedStatus === 'Packed') {
        msg = `Hey ${customerName},\n\nYour order #${orderId} has been packed and is ready to be handed over to ${courier}. We will share the tracking link once dispatched.`;
      } else if (selectedStatus === 'Shipped') {
        msg = `Hey ${customerName},\n\nGood news! Your order #${orderId} has been shipped via ${courier}. Your Tracking Number is ${tracking}. You can track it here: https://track.delhivery.com/query?id=${tracking}`;
      } else if (selectedStatus === 'In Transit') {
        msg = `Hey ${customerName},\n\nYour order #${orderId} is currently in transit with ${courier}. It is on its way to your destination sorting facility.`;
      } else if (selectedStatus === 'Delivered') {
        msg = `Hey ${customerName},\n\nYour order #${orderId} has been successfully delivered! Thank you for choosing MAGMAZOES. Hope you love your new drop!`;
      } else if (selectedStatus === 'Cancelled') {
        msg = `Hey ${customerName},\n\nWe regret to inform you that your order #${orderId} has been cancelled. If any payment was made, your refund is being processed.`;
      } else {
        msg = `Hey ${customerName},\n\nYour order #${orderId} status has been updated to: ${selectedStatus.toUpperCase()}.`;
      }
      msgTextarea.value = msg;
    };

    statusSelect.addEventListener('change', updateDefaultMessage);
    document.getElementById('edit-courier').addEventListener('input', updateDefaultMessage);
    document.getElementById('edit-tracking').addEventListener('input', updateDefaultMessage);
    
    // Initial pre-fill trigger
    updateDefaultMessage();

    // Timeline Form submit handler
    document.getElementById('order-update-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = statusSelect.value;
      const courier_name = document.getElementById('edit-courier').value.trim();
      const tracking_number = document.getElementById('edit-tracking').value.trim();
      const status_message = msgTextarea.value.trim();
      const shipping_notes = document.getElementById('edit-shipping-notes').value.trim();

      try {
        const res = await fetch(`/api/admin/orders/${order.id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, courier_name, tracking_number, status_message, shipping_notes })
        });
        if (res.ok) {
          showToast('Order details and timeline successfully updated.', 'success');
          closeModal();
          renderAdminOrders(container);
        } else {
          showToast('Failed to update order details.', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Connection error.', 'error');
      }
    });

    // Invoice Button
    document.getElementById('order-details-invoice-btn').addEventListener('click', () => {
      window.open(`/order-invoice/${order.id}`, '_blank');
    });

    // Fetch and render notification logs in details modal
    fetch(`/api/admin/orders/${order.id}/notifications`)
      .then(res => res.json())
      .then(logs => {
        const logsDiv = document.getElementById('modal-notification-logs');
        if (!logsDiv) return;
        if (logs.length === 0) {
          logsDiv.innerHTML = `<p class="text-on-surface-variant italic text-left">No dispatch notifications have been recorded yet.</p>`;
          return;
        }
        logsDiv.innerHTML = logs.map(l => `
          <div class="p-3 bg-surface-container-low border border-outline-variant flex flex-col gap-1 text-left">
            <div class="flex justify-between items-center">
              <span class="font-bold text-secondary uppercase text-xs">${l.type.toUpperCase()} DISPATCHED - ${l.event.toUpperCase()}</span>
              <span class="text-xs text-on-surface-variant font-mono">${new Date(l.created_at).toLocaleString()}</span>
            </div>
            <p class="text-on-surface text-[12px] whitespace-pre-line leading-relaxed font-mono bg-white p-2 rounded border border-outline-variant mt-1">${l.message}</p>
            <div class="flex items-center gap-1.5 text-xs ${l.status === 'sent' ? 'text-tertiary' : 'text-error'} mt-1">
              <span class="material-symbols-outlined text-[14px]">${l.status === 'sent' ? 'check_circle' : 'error'}</span>
              <span>Status: ${l.status.toUpperCase()} (Recipient: ${l.recipient})</span>
            </div>
          </div>
        `).join('');
      })
      .catch(err => {
        console.error(err);
        const logsDiv = document.getElementById('modal-notification-logs');
        if (logsDiv) logsDiv.innerHTML = `<p class="text-error text-left">Failed to load audit logs.</p>`;
      });
  }

  const rowsContainer = document.getElementById('admin-orders-rows');
  
  function loadAndRenderOrders() {
    fetch(`/api/admin/orders?page=${currentPage}&limit=${itemsPerPage}`)
      .then(res => res.json())
      .then(data => {
        allOrders = data.orders || [];
        const total = data.total || 0;
        const totalPages = data.pages || 1;

        rowsContainer.innerHTML = '';
        
        if (allOrders.length === 0) {
          rowsContainer.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-on-surface-variant font-body-md">No orders found.</td></tr>`;
          document.getElementById('admin-orders-page-num').textContent = `Page 1 of 1`;
          document.getElementById('admin-orders-prev-btn').disabled = true;
          document.getElementById('admin-orders-next-btn').disabled = true;
          return;
        }

        document.getElementById('admin-orders-page-num').textContent = `Page ${currentPage} of ${totalPages}`;
        document.getElementById('admin-orders-prev-btn').disabled = currentPage === 1;
        document.getElementById('admin-orders-next-btn').disabled = currentPage === totalPages;

        allOrders.forEach(o => {
          const row = document.createElement('tr');
          row.className = 'hover:bg-surface-container-low transition-colors';
          row.innerHTML = `
            <td class="py-4 font-label-md">#${o.id}</td>
            <td class="py-4">
              <span class="block font-semibold">${o.username}</span>
              <span class="text-xs text-on-surface-variant">${o.email}</span>
            </td>
            <td class="py-4 font-label-md font-mono">${o.tracking_number || 'Pending'}</td>
            <td class="py-4 font-body-md font-semibold">${formatINR(o.total)}</td>
            <td class="py-4">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                o.status === 'Pending' ? 'bg-secondary-fixed text-on-secondary-fixed-variant' :
                o.status === 'Cancelled' ? 'bg-error-container text-on-error-container' : 'bg-tertiary-fixed text-on-tertiary-fixed-variant'
              }">
                ${o.status.toUpperCase()}
              </span>
            </td>
            <td class="py-4 text-right flex justify-end items-center gap-3">
              <button class="px-3 py-1.5 bg-secondary text-white font-label-sm hover:bg-secondary/90 transition-colors view-order-btn">
                View
              </button>
              <select class="p-2 border rounded status-select font-label-sm" data-id="${o.id}">
                <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
              </select>
            </td>
          `;

          row.querySelector('.view-order-btn').addEventListener('click', async () => {
            try {
              const res = await fetch(`/api/admin/orders/${o.id}`);
              if (res.ok) {
                const fullOrder = await res.json();
                openOrderDetailsModal(fullOrder);
              } else {
                showToast('Failed to load order details.', 'error');
              }
            } catch (err) {
              console.error(err);
            }
          });

          row.querySelector('.status-select').addEventListener('change', async (e) => {
            const newStatus = e.target.value;
            await updateOrderStatus(o.id, newStatus);
          });

          rowsContainer.appendChild(row);
        });
      });
  }

  // Wire up pagination click listeners
  document.getElementById('admin-orders-prev-btn').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadAndRenderOrders();
    }
  });

  document.getElementById('admin-orders-next-btn').addEventListener('click', () => {
    currentPage++;
    loadAndRenderOrders();
  });

  loadAndRenderOrders();
}

// 7.4. Admin Customers Directory Tab
function renderAdminCustomers(container) {
  let currentPage = 1;
  const itemsPerPage = 15;
  let allCustomers = [];

  container.innerHTML = `
    <header class="mb-12">
      <h1 class="font-display-lg text-display-lg text-on-surface mb-2">Customers Directory</h1>
      <p class="text-on-surface-variant font-body-lg">View registered user accounts, contact information, and registration timestamps.</p>
    </header>

    <div class="bg-white border border-outline-variant p-6 mb-8">
      <input type="text" id="admin-cust-search" class="w-full md:w-96 p-3 border rounded border-outline-variant font-label-sm" placeholder="Search by username or email..." />
    </div>

    <div class="bg-white border border-outline-variant p-8">
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b border-outline-variant">
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">User ID</th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Username</th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Email Address</th>
              <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Registered Date</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant" id="admin-customers-rows"></tbody>
        </table>
      </div>
      <div class="flex justify-between items-center mt-6 pt-4 border-t border-outline-variant" id="admin-cust-pagination">
        <button class="px-4 py-2 border border-outline-variant hover:bg-surface-container-high disabled:opacity-40 disabled:hover:bg-transparent font-label-md transition-colors" id="admin-cust-prev-btn" disabled>Previous</button>
        <span class="font-label-md text-on-surface-variant" id="admin-cust-page-num">Page 1 of 1</span>
        <button class="px-4 py-2 border border-outline-variant hover:bg-surface-container-high disabled:opacity-40 disabled:hover:bg-transparent font-label-md transition-colors" id="admin-cust-next-btn" disabled>Next</button>
      </div>
    </div>
  `;

  const rowsContainer = document.getElementById('admin-customers-rows');
  const searchInput = document.getElementById('admin-cust-search');

  function loadCustomers() {
    const searchVal = searchInput.value.trim();
    let url = `/api/admin/customers?page=${currentPage}&limit=${itemsPerPage}`;
    if (searchVal) url += `&search=${encodeURIComponent(searchVal)}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        allCustomers = data.customers || [];
        const total = data.total || 0;
        const totalPages = data.pages || 1;

        rowsContainer.innerHTML = '';
        
        if (allCustomers.length === 0) {
          rowsContainer.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-on-surface-variant font-body-md">No customer records found.</td></tr>`;
          document.getElementById('admin-cust-page-num').textContent = `Page 1 of 1`;
          document.getElementById('admin-cust-prev-btn').disabled = true;
          document.getElementById('admin-cust-next-btn').disabled = true;
          return;
        }

        document.getElementById('admin-cust-page-num').textContent = `Page ${currentPage} of ${totalPages}`;
        document.getElementById('admin-cust-prev-btn').disabled = currentPage === 1;
        document.getElementById('admin-cust-next-btn').disabled = currentPage === totalPages;

        allCustomers.forEach(u => {
          const row = document.createElement('tr');
          row.className = 'hover:bg-surface-container-lowest transition-colors';
          row.innerHTML = `
            <td class="py-4 font-label-md">#${u.id}</td>
            <td class="py-4 font-semibold text-on-surface">@${u.username}</td>
            <td class="py-4 font-body-md">${u.email}</td>
            <td class="py-4 font-label-md text-on-surface-variant">${new Date(u.created_at).toLocaleDateString()}</td>
          `;
          rowsContainer.appendChild(row);
        });
      });
  }

  searchInput.addEventListener('input', debounce(() => {
    currentPage = 1;
    loadCustomers();
  }, 300));

  document.getElementById('admin-cust-prev-btn').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadCustomers();
    }
  });

  document.getElementById('admin-cust-next-btn').addEventListener('click', () => {
    currentPage++;
    loadCustomers();
  });

  loadCustomers();
}

// 7.5. Admin Category Management Tab
function renderAdminCategories(container) {
  container.innerHTML = `
    <header class="mb-12 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
      <div>
        <h1 class="font-display-lg text-display-lg text-on-surface mb-2">Category Management</h1>
        <p class="text-on-surface-variant font-body-lg">Organize store collections and drops.</p>
      </div>
      <button class="px-6 py-3 bg-secondary text-white font-label-md hover:scale-105 transition-transform" id="admin-add-cat-btn">
        Create Category
      </button>
    </header>

    <div id="category-form-container" class="mb-8 p-6 border border-outline-variant bg-white rounded-lg hidden"></div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
      <!-- Categories Listing Card -->
      <div class="bg-white border border-outline-variant p-8">
        <h3 class="font-headline-md text-headline-md mb-8">Active Store Sections</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead>
              <tr class="border-b border-outline-variant">
                <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Name</th>
                <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Slug</th>
                <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Products</th>
                <th class="pb-4 font-label-md text-label-md text-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant" id="admin-categories-rows"></tbody>
          </table>
        </div>
      </div>

      <!-- Categories Info / Helper Panel -->
      <div class="bg-surface-container-low border border-outline-variant p-8 rounded-lg flex flex-col justify-between">
        <div>
          <h3 class="font-headline-md text-headline-md mb-4">Database-driven Sections</h3>
          <p class="text-on-surface-variant font-body-md mb-4">These categories define the high-end streetwear collections loaded dynamically on the homepage and catalog shop filters:</p>
          <ul class="list-disc list-inside space-y-2 text-sm text-on-surface-variant font-label-md">
            <li><b>New Release</b> (Default collection for new drops)</li>
            <li><b>Limited Edition</b> (Special curated high-end pairs)</li>
            <li><b>Collection</b> (Core seasonal designs)</li>
            <li><b>Resale</b> (Certified authentic secondary market items)</li>
          </ul>
        </div>
        <div class="mt-8 p-4 bg-white border border-outline-variant rounded">
          <span class="font-semibold text-secondary">Tip:</span> Deleting a category updates all products assigned to it to "Uncategorized" immediately.
        </div>
      </div>
    </div>
  `;

  const rowsContainer = document.getElementById('admin-categories-rows');
  const formContainer = document.getElementById('category-form-container');

  // Trigger Add Category form
  document.getElementById('admin-add-cat-btn').addEventListener('click', () => {
    openCategoryForm(null);
  });

  async function loadCategories() {
    try {
      const catsRes = await fetch('/api/categories');
      const cats = await catsRes.json();

      rowsContainer.innerHTML = '';
      cats.forEach(c => {
        const prodCount = c.product_count || 0;
        const row = document.createElement('tr');
        row.innerHTML = `
          <td class="py-4 font-bold text-on-surface">${c.name}</td>
          <td class="py-4 font-mono text-xs text-on-surface-variant">${c.slug}</td>
          <td class="py-4 font-body-md">${prodCount} items</td>
          <td class="py-4 text-right space-x-2">
            <button class="px-2.5 py-1 bg-surface-container-high border border-outline-variant text-xs font-bold hover:bg-outline-variant edit-cat-btn">EDIT</button>
            <button class="px-2.5 py-1 bg-error-container text-on-error-container text-xs font-bold hover:bg-error delete-cat-btn">DELETE</button>
          </td>
        `;

        row.querySelector('.edit-cat-btn').addEventListener('click', () => openCategoryForm(c));
        row.querySelector('.delete-cat-btn').addEventListener('click', () => deleteCategory(c));

        rowsContainer.appendChild(row);
      });
    } catch (err) {
      console.error(err);
    }
  }

  function openCategoryForm(c) {
    formContainer.classList.remove('hidden');
    formContainer.scrollIntoView({ behavior: 'smooth' });

    formContainer.innerHTML = `
      <h3 class="font-headline-md text-headline-md mb-4">${c ? 'Rename Category' : 'Create New Category'}</h3>
      <form id="category-crud-form" class="flex flex-col sm:flex-row gap-4 items-end font-label-md text-label-md">
        <div class="flex-grow w-full">
          <label class="block mb-2">Category Name</label>
          <input type="text" id="cat-name" class="w-full p-3 border rounded border-outline-variant" value="${c ? c.name : ''}" required />
        </div>
        <div class="flex gap-4 w-full sm:w-auto">
          <button type="submit" class="px-6 py-3 bg-secondary text-white font-bold w-full sm:w-auto">Save</button>
          <button type="button" class="px-6 py-3 border border-outline-variant w-full sm:w-auto" id="cat-cancel-btn">Cancel</button>
        </div>
      </form>
    `;

    document.getElementById('cat-cancel-btn').addEventListener('click', () => {
      formContainer.classList.add('hidden');
    });

    document.getElementById('category-crud-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('cat-name').value.trim();
      const url = c ? `/api/admin/categories/${c.id}` : '/api/admin/categories';
      const method = c ? 'PUT' : 'POST';

      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        if (res.ok) {
          formContainer.classList.add('hidden');
          loadCategories();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to save category.', 'error');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  async function deleteCategory(c) {
    showConfirm('Delete Category', `Are you sure you want to delete the category "${c.name}"?`, async () => {
      try {
        const res = await fetch(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Category deleted.', 'success');
          loadCategories();
        } else {
          showToast('Failed to delete category.', 'error');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  loadCategories();
}

// 7.6. Admin Settings & Coupons Tab
function renderAdminSettings(container) {
  container.innerHTML = `
    <header class="mb-12">
      <h1 class="font-display-lg text-display-lg text-on-surface mb-2">Settings & Configuration</h1>
      <p class="text-on-surface-variant font-body-lg">Adjust global platform configuration parameters and manage promotional coupons.</p>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
      <!-- Store Settings Card -->
      <div class="bg-white border border-outline-variant p-8 flex flex-col justify-between">
        <div>
          <h3 class="font-headline-md text-headline-md mb-8">Store Parameters</h3>
          <form id="admin-settings-form" class="space-y-6 font-label-md text-label-md">
            <div>
              <label class="block mb-2">Store Name</label>
              <input type="text" id="sett-store-name" class="w-full p-3 border rounded border-outline-variant" required />
            </div>
            <div>
              <label class="block mb-2">Currency Symbol</label>
              <input type="text" id="sett-currency" class="w-full p-3 border rounded border-outline-variant" disabled />
            </div>
            <div>
              <label class="block mb-2">Tax Rate (e.g. 0.18 for 18% GST)</label>
              <input type="number" step="0.01" id="sett-tax-rate" class="w-full p-3 border rounded border-outline-variant" required />
            </div>
            <div>
              <label class="block mb-2">Shipping Cost (INR ₹)</label>
              <input type="number" id="sett-shipping" class="w-full p-3 border rounded border-outline-variant" required />
            </div>
            <button type="submit" class="px-6 py-3 bg-secondary text-white font-bold hover:scale-105 transition-transform">
              Save Global Settings
            </button>
          </form>
        </div>
      </div>

      <!-- Coupon Codes Management Card -->
      <div class="bg-white border border-outline-variant p-8">
        <h3 class="font-headline-md text-headline-md mb-8">Promotional Coupons</h3>
        
        <!-- Add Coupon Mini Form -->
        <form id="admin-add-coupon-form" class="flex flex-col sm:flex-row gap-4 items-end mb-8 font-label-md text-label-md p-4 bg-surface-container-low rounded border border-outline-variant">
          <div class="w-full sm:w-1/2">
            <label class="block mb-2">Coupon Code</label>
            <input type="text" id="cp-code" class="w-full p-3 border rounded border-outline-variant bg-white" placeholder="e.g. FLASHSALE" required />
          </div>
          <div class="w-full sm:w-1/3">
            <label class="block mb-2">Discount (%)</label>
            <input type="number" min="1" max="100" id="cp-discount" class="w-full p-3 border rounded border-outline-variant bg-white" placeholder="20" required />
          </div>
          <button type="submit" class="px-6 py-3 bg-secondary text-white font-bold w-full sm:w-auto">
            ADD
          </button>
        </form>

        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead>
              <tr class="border-b border-outline-variant">
                <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Code</th>
                <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Discount</th>
                <th class="pb-4 font-label-md text-label-md text-on-surface-variant">Status</th>
                <th class="pb-4 font-label-md text-label-md text-on-surface-variant text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant" id="admin-coupons-rows"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const settingsForm = document.getElementById('admin-settings-form');
  const storeNameInput = document.getElementById('sett-store-name');
  const currencyInput = document.getElementById('sett-currency');
  const taxRateInput = document.getElementById('sett-tax-rate');
  const shippingInput = document.getElementById('sett-shipping');

  const couponForm = document.getElementById('admin-add-coupon-form');
  const couponsRows = document.getElementById('admin-coupons-rows');

  // Load Settings
  fetch('/api/settings')
    .then(res => res.json())
    .then(settings => {
      storeNameInput.value = settings.store_name || 'MAGMAZOES';
      currencyInput.value = settings.currency || '₹';
      taxRateInput.value = settings.tax_rate || '0.18';
      shippingInput.value = settings.shipping_cost || '0';
    });

  // Save Settings
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      store_name: storeNameInput.value.trim(),
      tax_rate: parseFloat(taxRateInput.value),
      shipping_cost: parseFloat(shippingInput.value)
    };

    const doSave = async () => {
      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast('System settings successfully updated.', 'success');
        } else {
          const data = await res.json().catch(() => ({}));
          if (res.status === 403 && data.error === 'sudo_required') {
            promptSudo(doSave);
          } else {
            showToast(data.error || 'Failed to update system settings.', 'error');
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    await doSave();
  });

  // Load Coupons
  function loadCoupons() {
    fetch('/api/admin/coupons')
      .then(res => res.json())
      .then(coupons => {
        couponsRows.innerHTML = '';
        if (coupons.length === 0) {
          couponsRows.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-on-surface-variant font-body-md">No coupons created.</td></tr>`;
          return;
        }

        coupons.forEach(c => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td class="py-4 font-bold text-on-surface font-mono">${c.code}</td>
            <td class="py-4 font-body-md">${c.discount_percent}% OFF</td>
            <td class="py-4">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${c.active ? 'bg-tertiary-fixed text-on-tertiary-fixed-variant' : 'bg-outline-variant text-on-surface-variant'}">
                ${c.active ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </td>
            <td class="py-4 text-right">
              <button class="px-2 py-1 bg-error-container text-on-error-container text-xs font-bold hover:bg-error delete-cp-btn">DELETE</button>
            </td>
          `;

          row.querySelector('.delete-cp-btn').addEventListener('click', () => deleteCoupon(c.id));
          couponsRows.appendChild(row);
        });
      });
  }

  // Create Coupon
  couponForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('cp-code').value.trim();
    const discount_percent = parseFloat(document.getElementById('cp-discount').value);

    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, discount_percent, active: 1 })
      });
      if (res.ok) {
        couponForm.reset();
        loadCoupons();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to create coupon.', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Delete Coupon
  async function deleteCoupon(id) {
    showConfirm('Delete Coupon', 'Are you sure you want to delete this coupon?', async () => {
      try {
        const res = await fetch(`/api/admin/coupons/${id}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Coupon deleted.', 'success');
          loadCoupons();
        } else {
          showToast('Failed to delete coupon.', 'error');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  loadCoupons();
}

// 7.7. Admin Team Management Tab
async function renderAdminTeam(container) {
  container.innerHTML = `
    <header class="mb-12">
      <h1 class="font-display-lg text-display-lg text-on-surface mb-2">Team & Security Center</h1>
      <p class="text-on-surface-variant font-body-lg">Manage administrative operators, permissions, and audit logs.</p>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
      <!-- Invite Member Form -->
      <div class="lg:col-span-1 bg-white border border-outline-variant p-8 flex flex-col gap-6">
        <h3 class="font-headline-md text-headline-md uppercase text-on-surface">Invite Member</h3>
        <form id="team-invite-form" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="invite-username" class="font-label-md text-label-md text-on-surface-variant">Username</label>
            <input type="text" id="invite-username" placeholder="e.g. jason_c" class="w-full border border-outline px-4 py-3 text-sm font-body-md focus:outline-none focus:border-secondary" required />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="invite-email" class="font-label-md text-label-md text-on-surface-variant">Email Address</label>
            <input type="email" id="invite-email" placeholder="operator@magmazoes.com" class="w-full border border-outline px-4 py-3 text-sm font-body-md focus:outline-none focus:border-secondary" required />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="invite-password" class="font-label-md text-label-md text-on-surface-variant">Password</label>
            <input type="password" id="invite-password" placeholder="••••••••" class="w-full border border-outline px-4 py-3 text-sm font-body-md focus:outline-none focus:border-secondary" required />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="invite-role" class="font-label-md text-label-md text-on-surface-variant">Role</label>
            <select id="invite-role" class="w-full border border-outline px-4 py-3 text-sm font-body-md bg-white focus:outline-none focus:border-secondary" required>
              <option value="staff">Staff</option>
              <option value="admin">Administrator</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <button type="submit" class="bg-secondary text-white py-3 font-label-md text-sm uppercase hover:bg-secondary/90 transition-all flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-sm">person_add</span> Create Account
          </button>
        </form>
      </div>

      <!-- Team Members List -->
      <div class="lg:col-span-2 bg-white border border-outline-variant p-8 flex flex-col gap-6">
        <h3 class="font-headline-md text-headline-md uppercase text-on-surface">Active Team Members</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="border-b border-outline-variant text-[11px] uppercase tracking-wider font-bold text-on-surface-variant bg-surface-container-low">
                <th class="p-3">User</th>
                <th class="p-3">Email</th>
                <th class="p-3">Role</th>
                <th class="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="team-members-rows" class="divide-y divide-outline-variant">
              <tr>
                <td colspan="4" class="p-4 text-center text-on-surface-variant font-body-md">Loading team members...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Audit Logs Section -->
    <div class="bg-white border border-outline-variant p-8 flex flex-col gap-6">
      <h3 class="font-headline-md text-headline-md uppercase text-on-surface">Security Audit Log</h3>
      <p class="text-on-surface-variant font-body-md -mt-4 text-xs">A tracking trail of administrative settings modifications, deletes, and access escalations.</p>
      <div class="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table class="w-full text-left border-collapse text-sm">
          <thead>
            <tr class="border-b border-outline-variant text-[11px] uppercase tracking-wider font-bold text-on-surface-variant bg-surface-container-low sticky top-0">
              <th class="p-3">Timestamp</th>
              <th class="p-3">Operator</th>
              <th class="p-3">Action</th>
              <th class="p-3">Details</th>
            </tr>
          </thead>
          <tbody id="audit-logs-rows" class="divide-y divide-outline-variant font-mono text-xs">
            <tr>
              <td colspan="4" class="p-4 text-center text-on-surface-variant font-body-md">Loading audit trail...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Fetch current user so we don't allow modifying self
  let currentUser = null;
  try {
    const meRes = await fetch('/api/me');
    const meData = await meRes.json();
    if (meData.loggedIn) {
      currentUser = meData.user;
    }
  } catch(err) {
    console.error(err);
  }

  const loadTeam = async () => {
    try {
      const res = await fetch('/api/admin/team');
      const team = await res.json();
      const tbody = document.getElementById('team-members-rows');
      tbody.innerHTML = '';

      if (!Array.isArray(team)) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-error font-body-md">Error loading team.</td></tr>`;
        return;
      }

      team.forEach(member => {
        const isSelf = currentUser && currentUser.id === member.id;
        const row = document.createElement('tr');
        row.className = 'border-b border-outline-variant hover:bg-surface-container-lowest transition-colors';
        
        let roleSelectHTML = '';
        if (isSelf) {
          roleSelectHTML = `<span class="px-2 py-0.5 bg-secondary-container text-on-secondary-container font-label-sm text-xs uppercase rounded">${member.role}</span> <span class="text-xs text-on-surface-variant italic">(You)</span>`;
        } else {
          roleSelectHTML = `
            <select class="team-role-select border border-outline px-2 py-1 text-xs font-body-md bg-white focus:outline-none focus:border-secondary" data-user-id="${member.id}">
              <option value="staff" ${member.role === 'staff' ? 'selected' : ''}>Staff</option>
              <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Administrator</option>
              <option value="owner" ${member.role === 'owner' ? 'selected' : ''}>Owner</option>
            </select>
          `;
        }

        const actionHTML = isSelf ? 
          `<span class="text-xs text-on-surface-variant italic">N/A</span>` :
          `<button class="delete-team-btn border border-error text-error px-3 py-1 font-label-sm text-xs uppercase hover:bg-error/10 transition-colors flex items-center gap-1" data-user-id="${member.id}" data-username="${member.username}">
            <span class="material-symbols-outlined text-xs">delete</span> Remove
           </button>`;

        row.innerHTML = `
          <td class="p-3 font-bold text-on-surface">@${member.username}</td>
          <td class="p-3 text-on-surface-variant font-mono text-xs">${member.email}</td>
          <td class="p-3">${roleSelectHTML}</td>
          <td class="p-3 text-right flex justify-end">${actionHTML}</td>
        `;
        tbody.appendChild(row);
      });

      // Bind role select listeners
      tbody.querySelectorAll('.team-role-select').forEach(select => {
        select.addEventListener('change', async (e) => {
          const userId = select.getAttribute('data-user-id');
          const newRole = select.value;
          
          const updateRole = async () => {
            try {
              const putRes = await fetch(`/api/admin/team/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole })
              });
              if (putRes.ok) {
                showToast('Role updated successfully.', 'success');
                loadTeam();
                loadAuditLogs();
              } else {
                const data = await putRes.json().catch(() => ({}));
                if (putRes.status === 403 && data.error === 'sudo_required') {
                  promptSudo(updateRole);
                } else {
                  showToast(data.error || 'Failed to update role.', 'error');
                  loadTeam();
                }
              }
            } catch (err) {
              console.error(err);
              showToast('Server error during update.', 'error');
            }
          };

          updateRole();
        });
      });

      // Bind remove listeners
      tbody.querySelectorAll('.delete-team-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const userId = btn.getAttribute('data-user-id');
          const username = btn.getAttribute('data-username');

          const deleteMember = async () => {
            try {
              const delRes = await fetch(`/api/admin/team/${userId}`, {
                method: 'DELETE'
              });
              if (delRes.ok) {
                showToast('Team member removed.', 'success');
                loadTeam();
                loadAuditLogs();
              } else {
                const data = await delRes.json().catch(() => ({}));
                if (delRes.status === 403 && data.error === 'sudo_required') {
                  promptSudo(deleteMember);
                } else {
                  showToast(data.error || 'Failed to remove team member.', 'error');
                }
              }
            } catch (err) {
              console.error(err);
            }
          };

          showConfirm('Remove Team Member', `Are you sure you want to remove @${username} from the team?`, deleteMember);
        });
      });

    } catch (err) {
      console.error(err);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const res = await fetch('/api/admin/audit-logs');
      const logs = await res.json();
      const tbody = document.getElementById('audit-logs-rows');
      tbody.innerHTML = '';

      if (!Array.isArray(logs)) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-error font-body-md">Error loading logs.</td></tr>`;
        return;
      }

      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-on-surface-variant font-body-md">No security audits recorded yet.</td></tr>`;
        return;
      }

      logs.forEach(log => {
        const row = document.createElement('tr');
        row.className = 'border-b border-outline-variant hover:bg-surface-container-lowest transition-colors';
        const dateStr = new Date(log.created_at).toLocaleString();
        
        row.innerHTML = `
          <td class="p-3 text-on-surface-variant whitespace-nowrap">${dateStr}</td>
          <td class="p-3 font-bold text-on-surface">@${log.username || 'System'}</td>
          <td class="p-3 text-secondary font-bold uppercase tracking-wider">${log.action}</td>
          <td class="p-3 text-on-surface-variant">${log.details || ''}</td>
        `;
        tbody.appendChild(row);
      });
    } catch(err) {
      console.error(err);
    }
  };

  // Bind invite form submission
  const inviteForm = document.getElementById('team-invite-form');
  inviteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('invite-username').value.trim();
    const email = document.getElementById('invite-email').value.trim();
    const password = document.getElementById('invite-password').value;
    const role = document.getElementById('invite-role').value;

    const doInvite = async () => {
      try {
        const res = await fetch('/api/admin/team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password, role })
        });
        if (res.ok) {
          showToast('Team member added successfully.', 'success');
          inviteForm.reset();
          loadTeam();
          loadAuditLogs();
        } else {
          const data = await res.json().catch(() => ({}));
          if (res.status === 403 && data.error === 'sudo_required') {
            promptSudo(doInvite);
          } else {
            showToast(data.error || 'Failed to add team member.', 'error');
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    await doInvite();
  });

  // Load initial data
  await loadTeam();
  await loadAuditLogs();
}
