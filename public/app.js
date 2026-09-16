const API = '';
let currentUser = null;
let myCoords = null;

const emojis = {
  "Hortaliças": "🥬", "Frutas": "🍎", "Grãos": "🌾",
  "Tubérculos": "🥔", "Leguminosas": "🫘", "Outros": "📦"
};

// ========== AUTENTICAÇÃO ==========
function switchTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
}

async function login(e) {
  e.preventDefault();
  const res = await fetch(API + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: document.getElementById('login-phone').value,
      password: document.getElementById('login-password').value
    })
  });
  const data = await res.json();
  if (!res.ok) return alert('❌ ' + data.error);
  localStorage.setItem('nzila_token', data.token);
  localStorage.setItem('nzila_user', JSON.stringify(data.user));
  currentUser = data.user;
  updateAuthUI();
  alert('✅ Bem-vindo, ' + data.user.name + '!');
  showPage('home', document.querySelector('nav button'));
}

async function register(e) {
  e.preventDefault();
  const res = await fetch(API + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: document.getElementById('reg-name').value,
      phone: document.getElementById('reg-phone').value,
      location: document.getElementById('reg-location').value,
      password: document.getElementById('reg-password').value
    })
  });
  const data = await res.json();
  if (!res.ok) return alert('❌ ' + data.error);
  localStorage.setItem('nzila_token', data.token);
  localStorage.setItem('nzila_user', JSON.stringify(data.user));
  currentUser = data.user;
  updateAuthUI();
  alert('✅ Conta criada com sucesso!');
  showPage('home', document.querySelector('nav button'));
}

function logout() {
  localStorage.removeItem('nzila_token');
  localStorage.removeItem('nzila_user');
  currentUser = null;
  updateAuthUI();
  showPage('home', document.querySelector('nav button'));
}

function updateAuthUI() {
  const btnAuth = document.getElementById('btn-auth');
  const btnMy = document.getElementById('btn-my');
  if (currentUser) {
    btnAuth.textContent = '🚪 Sair (' + currentUser.name.split(' ')[0] + ')';
    btnAuth.onclick = logout;
    btnMy.style.display = 'inline-block';
  } else {
    btnAuth.textContent = '🔐 Entrar';
    btnAuth.onclick = () => showPage('auth', btnAuth);
    btnMy.style.display = 'none';
  }
}

function authHeaders() {
  const token = localStorage.getItem('nzila_token');
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

// ========== NAVEGAÇÃO ==========
function showPage(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(page).classList.remove('hidden');
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  window.scrollTo(0, 0);
  
  if (page === 'home') loadHome();
  if (page === 'products') loadProducts();
  if (page === 'my-products') loadMyProducts();
}

// ========== HOME ==========
async function loadHome() {
  const stats = await (await fetch(API + '/api/stats')).json();
  document.getElementById('stats').innerHTML = `
    <div class="stat-card"><div class="num">${stats.products}</div><div class="label">Produtos</div></div>
    <div class="stat-card"><div class="num">${stats.farmers}</div><div class="label">Agricultores</div></div>
    <div class="stat-card"><div class="num">${stats.categories}</div><div class="label">Categorias</div></div>
  `;
  
  const products = await (await fetch(API + '/api/products')).json();
  document.getElementById('featured').innerHTML = products.slice(0, 4).map(renderCard).join('') ||
    '<div class="empty-state">Nenhum produto ainda. Seja o primeiro!</div>';
}

// ========== PRODUTOS ==========
async function loadProducts() {
  const search = document.getElementById('search').value;
  const category = document.getElementById('filter-category').value;
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (category) params.append('category', category);
  
  const products = await (await fetch(API + '/api/products?' + params)).json();
  document.getElementById('all-products').innerHTML = products.map(renderCard).join('') ||
    '<div class="empty-state">Nenhum produto encontrado</div>';
}

function renderCard(p) {
  const img = p.image 
    ? `<img src="${p.image}" alt="${p.name}">`
    : `<span>${emojis[p.category] || '🌱'}</span>`;
  const stars = p.avg_rating ? '⭐ ' + Number(p.avg_rating).toFixed(1) : '';
  const distance = p.distance ? `<span class="distance-badge">📍 ${p.distance} km</span>` : '';
  
  return `
    <div class="product-card" onclick="showProduct(${p.id})">
      <div class="product-img">${img}</div>
      <div class="product-info">
        <span class="product-category">${p.category}</span>
        <h3>${p.name}</h3>
        <div class="product-price">${Number(p.price).toLocaleString()} Kz</div>
        <div class="product-details">📦 ${p.quantity}</div>
        <div class="product-details">📍 ${p.location}</div>
        <div class="product-details">👨‍🌾 ${p.farmer_name}</div>
        ${stars ? `<div class="rating">${stars} (${p.review_count || 0})</div>` : ''}
        ${distance}
      </div>
    </div>
  `;
}

// ========== DETALHES + AVALIAÇÕES ==========
async function showProduct(id) {
  const p = await (await fetch(API + '/api/products/' + id)).json();
  const img = p.image 
    ? `<img src="${p.image}" alt="${p.name}">`
    : `<div style="font-size:8em">${emojis[p.category] || '🌱'}</div>`;
  
  const reviewsHtml = p.reviews && p.reviews.length > 0
    ? p.reviews.map(r => `
        <div class="review">
          <div class="review-header">
            <span class="review-name">${r.user_name}</span>
            <span class="review-stars">${'⭐'.repeat(r.rating)}</span>
          </div>
          <p>${r.comment || '(sem comentário)'}</p>
        </div>
      `).join('')
    : '<p style="color:#888">Ainda sem avaliações.</p>';
  
  document.getElementById('detail-content').innerHTML = `
    <div class="detail-header">
      <div>${img}</div>
      <div class="detail-info">
        <span class="product-category">${p.category}</span>
        <h2>${p.name}</h2>
        <div class="product-price">${Number(p.price).toLocaleString()} Kz</div>
        <div class="product-details">📦 ${p.quantity}</div>
        <div class="product-details">📍 ${p.location}</div>
        <div class="product-details">👨‍🌾 ${p.farmer_name}</div>
        <div class="product-details">📞 ${p.farmer_phone}</div>
        ${p.description ? `<p style="margin-top:15px; line-height:1.6">${p.description}</p>` : ''}
        <a href="https://wa.me/${p.farmer_phone.replace(/\D/g,'')}?text=Olá ${p.farmer_name}, vi o seu ${p.name} na Nzila Agro." 
           target="_blank" class="btn-contact" style="margin-top:20px">
          📱 Contactar via WhatsApp
        </a>
      </div>
    </div>
    
    <div class="reviews-section">
      <h3 style="color:#2d5016; margin-bottom:15px">⭐ Avaliações (${p.reviews?.length || 0})</h3>
      ${reviewsHtml}
      
      <form onsubmit="submitReview(event, ${p.id})" style="margin-top:20px; border-top:1px solid #eee; padding-top:20px">
        <h4 style="margin-bottom:10px">Deixe sua avaliação</h4>
        <div class="form-group">
          <label>Seu nome</label>
          <input type="text" id="r-name" required>
        </div>
        <div class="form-group">
          <label>Nota (1 a 5)</label>
          <select id="r-rating" required>
            <option value="5">⭐⭐⭐⭐⭐ Excelente</option>
            <option value="4">⭐⭐⭐⭐ Muito bom</option>
            <option value="3">⭐⭐⭐ Bom</option>
            <option value="2">⭐⭐ Regular</option>
            <option value="1">⭐ Ruim</option>
          </select>
        </div>
        <div class="form-group">
          <label>Comentário</label>
          <textarea id="r-comment"></textarea>
        </div>
        <button type="submit" class="btn-submit">Enviar avaliação</button>
      </form>
    </div>
  `;
  
  showPage('product-detail', null);
}

async function submitReview(e, productId) {
  e.preventDefault();
  const res = await fetch(API + '/api/products/' + productId + '/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_name: document.getElementById('r-name').value,
      rating: document.getElementById('r-rating').value,
      comment: document.getElementById('r-comment').value
    })
  });
  if (res.ok) {
    alert('✅ Avaliação enviada!');
    showProduct(productId);
  }
}

// ========== PUBLICAR ==========
function captureGeo() {
  if (!navigator.geolocation) return alert('Geolocalização não suportada');
  document.getElementById('geo-status').textContent = '📡 Capturando...';
  navigator.geolocation.getCurrentPosition(
    pos => {
      myCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      document.getElementById('p-lat').value = myCoords.lat;
      document.getElementById('p-lng').value = myCoords.lng;
      document.getElementById('geo-status').textContent = '✅ Localização capturada!';
    },
    err => {
      document.getElementById('geo-status').textContent = '❌ ' + err.message;
    }
  );
}

async function publishProduct(e) {
  e.preventDefault();
  if (!currentUser) {
    alert('⚠️ Faça login para publicar!');
    return showPage('auth', document.getElementById('btn-auth'));
  }
  
  const form = new FormData();
  form.append('name', document.getElementById('p-name').value);
  form.append('category', document.getElementById('p-category').value);
  form.append('quantity', document.getElementById('p-quantity').value);
  form.append('price', document.getElementById('p-price').value);
  form.append('location', document.getElementById('p-location').value);
  form.append('description', document.getElementById('p-description').value);
  
  const img = document.getElementById('p-image').files[0];
  if (img) form.append('image', img);
  
  if (document.getElementById('p-geo').checked) {
    const lat = document.getElementById('p-lat').value;
    const lng = document.getElementById('p-lng').value;
    if (lat && lng) {
      form.append('latitude', lat);
      form.append('longitude', lng);
    }
  }
  
  const res = await fetch(API + '/api/products', {
    method: 'POST',
    headers: authHeaders(),
    body: form
  });
  const data = await res.json();
  if (!res.ok) return alert('❌ ' + data.error);
  
  alert('✅ Produto publicado com sucesso!');
  e.target.reset();
  showPage('my-products', document.getElementById('btn-my'));
}

// ========== MEUS PRODUTOS ==========
async function loadMyProducts() {
  if (!currentUser) return showPage('auth', document.getElementById('btn-auth'));
  const products = await (await fetch(API + '/api/products')).json();
  const mine = products.filter(p => p.user_id === currentUser.id);
  
  document.getElementById('my-products-list').innerHTML = mine.length === 0
    ? '<div class="empty-state">Você ainda não publicou produtos.</div>'
    : mine.map(p => `
      <div class="product-card">
        <div class="product-img">
          ${p.image ? `<img src="${p.image}">` : emojis[p.category] || '🌱'}
        </div>
        <div class="product-info">
          <h3>${p.name}</h3>
          <div class="product-price">${Number(p.price).toLocaleString()} Kz</div>
          <div class="product-details">📦 ${p.quantity}</div>
          <button class="btn-contact" onclick="showProduct(${p.id})">Ver detalhes</button>
          <button class="btn-delete" onclick="deleteProduct(${p.id})">🗑️ Remover</button>
        </div>
      </div>
    `).join('');
}

async function deleteProduct(id) {
  if (!confirm('Remover este produto?')) return;
  const res = await fetch(API + '/api/products/' + id, {
    method: 'DELETE',
    headers: authHeaders()
  });
  if (res.ok) {
    alert('✅ Produto removido');
    loadMyProducts();
  }
}

// ========== GEOLOCALIZAÇÃO ==========
function getMyLocation() {
  if (!navigator.geolocation) return alert('Geolocalização não suportada');
  document.getElementById('location-status').textContent = '📡 Obtendo localização...';
  navigator.geolocation.getCurrentPosition(
    async pos => {
      myCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      document.getElementById('location-status').textContent = '✅ Localização obtida! Buscando produtos próximos...';
      await loadNearby();
    },
    err => {
      document.getElementById('location-status').textContent = '❌ ' + err.message;
    }
  );
}

async function loadNearby() {
  if (!myCoords) return;
  const res = await fetch(`${API}/api/nearby?lat=${myCoords.lat}&lng=${myCoords.lng}&radius=100`);
  const products = await res.json();
  
  document.getElementById('nearby-products').innerHTML = products.length === 0
    ? '<div class="empty-state">Nenhum produto perto de você ainda.</div>'
    : products.map(renderCard).join('');
}

// ========== PWA ==========
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// ========== INICIALIZAÇÃO ==========
window.addEventListener('load', () => {
  const saved = localStorage.getItem('nzila_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    updateAuthUI();
  }
  loadHome();
});
