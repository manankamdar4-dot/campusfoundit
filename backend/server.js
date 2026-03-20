// ─── server.js ───
// Main Express server for CampusFoundIt backend.
// Sets up middleware (CORS, JSON parsing, file serving) and mounts all routes.

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Import the database (this also creates the tables on first run)
const db = require('./database');

// Import route handlers
const lostRoutes = require('./routes/lost');
const foundRoutes = require('./routes/found');
const adminRoutes = require('./routes/admin');

// Create the Express app
const app = express();

// ─── Middleware ───

// Allow requests from the frontend (GitHub Pages or localhost)
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'https://campusfoundit.github.io',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Parse incoming JSON request bodies
app.use(express.json());

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images as static files
// e.g. GET /uploads/photo-123.jpg
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Mount Routes ───

// Public routes for lost item reports
app.use('/api/lost', lostRoutes);

// Public routes for found item reports
app.use('/api/found', foundRoutes);

// Admin-only routes (protected by password header)
app.use('/api/admin', adminRoutes);

// ─── Stats Route ───
// Returns total counts for the homepage stats bar
app.get('/api/stats', async (req, res) => {
  try {
    // Count total reports in each table using the promise-based wrapper
    const totalLost = (await db.getOne('SELECT COUNT(*) AS count FROM lost_items')).count;
    const totalFound = (await db.getOne('SELECT COUNT(*) AS count FROM found_items')).count;
    const totalMatched = (await db.getOne('SELECT COUNT(*) AS count FROM matches WHERE confirmed = 1')).count;
    const totalReturned = (await db.getOne("SELECT COUNT(*) AS count FROM lost_items WHERE status = 'returned'")).count;

    res.json({
      success: true,
      data: {
        totalLost,
        totalFound,
        totalMatched,
        totalReturned
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }
});

// ─── Health Check ───
app.get('/', (req, res) => {
  res.json({
    message: 'CampusFoundIt API is running!',
    version: '1.0.0',
    endpoints: {
      stats: '/api/stats',
      lost: '/api/lost',
      found: '/api/found',
      admin: '/api/admin'
    }
  });
});

// ─── Start Server ───
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 CampusFoundIt server running on http://localhost:${PORT}`);
});
