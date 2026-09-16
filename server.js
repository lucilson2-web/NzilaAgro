const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'nzila_agro_secret_2026';

// Middlewares
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Criar pasta uploads
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Configuração do multer (upload de imagens)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random()*1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  }
});

// Middleware de autenticação
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

// ========== AUTENTICAÇÃO ==========
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, password, location } = req.body;
    if (!name || !phone || !password) 
      return res.status(400).json({ error: 'Preencha todos os campos' });
    
    const existing = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (existing) return res.status(400).json({ error: 'Telefone já cadastrado' });
    
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (name, phone, password, location) VALUES (?, ?, ?, ?)'
    ).run(name, phone, hash, location || '');
    
    const token = jwt.sign({ id: result.lastInsertRowid, name, phone }, JWT_SECRET);
    res.json({ token, user: { id: result.lastInsertRowid, name, phone, location } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });
    
    const token = jwt.sign({ id: user.id, name: user.name, phone: user.phone }, JWT_SECRET);
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, location: user.location } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== PRODUTOS ==========
app.get('/api/products', (req, res) => {
  const { category, search } = req.query;
  let sql = `
    SELECT p.*, u.name as farmer_name, u.phone as farmer_phone,
           (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) as avg_rating,
           (SELECT COUNT(*) FROM reviews WHERE product_id = p.id) as review_count
    FROM products p 
    JOIN users u ON p.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  
  if (category) { sql += ' AND p.category = ?'; params.push(category); }
  if (search) { 
    sql += ' AND (p.name LIKE ? OR p.location LIKE ?)'; 
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY p.created_at DESC';
  
  const products = db.prepare(sql).all(...params);
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const product = db.prepare(`
    SELECT p.*, u.name as farmer_name, u.phone as farmer_phone
    FROM products p JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);
  
  if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
  
  const reviews = db.prepare(
    'SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  
  res.json({ ...product, reviews });
});

app.post('/api/products', authMiddleware, upload.single('image'), (req, res) => {
  try {
    const { name, category, quantity, price, location, description, latitude, longitude } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : null;
    
    const result = db.prepare(`
      INSERT INTO products (user_id, name, category, quantity, price, location, description, image, latitude, longitude)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, name, category, quantity, parseFloat(price), 
      location, description, image, 
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null
    );
    
    res.json({ id: result.lastInsertRowid, message: 'Produto publicado!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/products/:id', authMiddleware, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Não encontrado' });
  if (product.user_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão' });
  
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ message: 'Produto removido' });
});

// ========== GEOLOCALIZAÇÃO - PRODUTOS PRÓXIMOS ==========
app.get('/api/nearby', (req, res) => {
  const { lat, lng, radius = 50 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'Lat/Lng obrigatórios' });
  
  const products = db.prepare(`
    SELECT p.*, u.name as farmer_name, u.phone as farmer_phone,
           (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) as avg_rating
    FROM products p JOIN users u ON p.user_id = u.id
    WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
  `).all();
  
  // Calcular distância (Haversine)
  const withDistance = products.map(p => {
    const R = 6371; // km
    const dLat = (p.latitude - parseFloat(lat)) * Math.PI / 180;
    const dLng = (p.longitude - parseFloat(lng)) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + 
              Math.cos(parseFloat(lat)*Math.PI/180) * Math.cos(p.latitude*Math.PI/180) *
              Math.sin(dLng/2)**2;
    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return { ...p, distance: distance.toFixed(2) };
  }).filter(p => p.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
  
  res.json(withDistance);
});

// ========== AVALIAÇÕES ==========
app.post('/api/products/:id/reviews', (req, res) => {
  const { user_name, rating, comment } = req.body;
  if (!user_name || !rating) return res.status(400).json({ error: 'Nome e nota obrigatórios' });
  
  db.prepare(
    'INSERT INTO reviews (product_id, user_name, rating, comment) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, user_name, parseInt(rating), comment || '');
  
  res.json({ message: 'Avaliação enviada!' });
});

// ========== ESTATÍSTICAS ==========
app.get('/api/stats', (req, res) => {
  const products = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  const farmers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const categories = db.prepare('SELECT COUNT(DISTINCT category) as c FROM products').get().c;
  res.json({ products, farmers, categories });
});

app.listen(PORT, () => {
  console.log(`🌾 Nzila Agro rodando em http://localhost:${PORT}`);
});
