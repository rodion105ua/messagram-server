const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://web.messagram.pp.ua'
  ],
  credentials: true
}));
app.use(express.json());

/* ================= FILES ================= */
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

app.use('/uploads', express.static(uploadsDir));

/* ================= MULTER ================= */
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

/* ================= SOCKET.IO ================= */
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'https://web.messagram.pp.ua'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

io.on('connection', (socket) => {
  console.log('🟢 Socket connected:', socket.id);

  socket.on('join', (username) => {
    socket.join(username);
  });

  socket.on('getMessages', ({ me, mate }) => {
    db.all(
      `
      SELECT * FROM messages
      WHERE (sender_username=? AND receiver_username=?)
         OR (sender_username=? AND receiver_username=?)
      ORDER BY id
      `,
      [me, mate, mate, me],
      (_, rows) => socket.emit('history', rows)
    );
  });

  socket.on('sendMessage', (msg) => {
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    db.run(
      `
      INSERT INTO messages (text, sender_username, receiver_username, timestamp, type, file_url)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        msg.text,
        msg.sender_username,
        msg.receiver_username,
        time,
        msg.type || 'text',
        msg.file_url || null
      ]
    );

    io.to(msg.sender_username)
      .to(msg.receiver_username)
      .emit('receiveMessage', { ...msg, timestamp: time });
  });

  socket.on('disconnect', () => {
    console.log('🔴 Socket disconnected:', socket.id);
  });
});

/* ================= DATABASE ================= */
const db = new sqlite3.Database('./messagram.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      avatar_url TEXT DEFAULT 'https://cdn-icons-png.flaticon.com/512/149/149071.png'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT,
      sender_username TEXT,
      receiver_username TEXT,
      timestamp TEXT,
      type TEXT,
      file_url TEXT
    )
  `);
});

/* ================= AUTH ================= */
app.post('/register', async (req, res) => {
  let { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: 'Missing fields' });

  username = username.trim().toLowerCase();
  const hash = await bcrypt.hash(password, 10);

  db.run(
    `INSERT INTO users (username, password) VALUES (?, ?)`,
    [username, hash],
    (err) => {
      if (err) return res.status(400).json({ error: 'User exists' });
      res.json({ success: true });
    }
  );
});

app.post('/login', (req, res) => {
  let { username, password } = req.body;
  username = username.trim().toLowerCase();

  db.get(
    `SELECT * FROM users WHERE username=?`,
    [username],
    async (_, user) => {
      if (!user) return res.status(400).json({ error: 'Not found' });

      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.status(400).json({ error: 'Wrong password' });

      res.json({ username: user.username });
    }
  );
});

/* ================= UPLOAD ================= */
app.post('/upload', upload.single('file'), (req, res) => {
  res.json({
    url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
  });
});

/* ================= HEALTH CHECK ================= */
app.get('/', (_, res) => {
  res.json({ status: 'ok' });
});

/* ================= START ================= */
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('🚀 Server running on port', PORT);
});
