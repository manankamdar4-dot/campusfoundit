// ─── routes/found.js ───
// Handles all routes for found item reports.
// GET  /api/found        — list all found items (public, no contact info)
// GET  /api/found/recent — 6 most recent found items for homepage
// POST /api/found        — submit a new found item report (triggers matching)

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database');
const { runMatching } = require('../utils/matching');
const cloudinary = require('../utils/cloudinary');
const streamifier = require('streamifier');

// ─── Multer Setup for Photo Uploads ───
// Use memory storage for Cloudinary upload
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (isValid) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, gif, webp) are allowed.'));
    }
  }
});

// ─── GET /api/found ───
// Returns all found items for the public browse page.
// IMPORTANT: does NOT include finder contact info or hidden details.
router.get('/', async (req, res) => {
  try {
    const items = await db.query(`
      SELECT id, item_name, category, color, brand, location_found, date_found,
             description, photo_path, status, created_at
      FROM found_items
      ORDER BY created_at DESC
    `);

    res.json({ success: true, data: items });
  } catch (error) {
    console.error('Error fetching found items:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch found items.' });
  }
});

// ─── GET /api/found/recent ───
// Returns the 6 most recent found items for the homepage cards.
router.get('/recent', async (req, res) => {
  try {
    const items = await db.query(`
      SELECT id, item_name, category, color, brand, location_found, date_found,
             description, photo_path, status, created_at
      FROM found_items
      ORDER BY created_at DESC
      LIMIT 6
    `);

    res.json({ success: true, data: items });
  } catch (error) {
    console.error('Error fetching recent found items:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch recent items.' });
  }
});

// ─── POST /api/found ───
// Submit a new found item report, then trigger the matching algorithm.
router.post('/', upload.single('photo'), async (req, res) => {
  try {
    const { name, email, phone, item_name, category, color, brand, location_found, date_found, description } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !item_name || !category || !color || !location_found || !date_found) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields.'
      });
    }

    let photo_path = null;

    if (req.file) {
      try {
        const uploadFromBuffer = (req) => {
          return new Promise((resolve, reject) => {
            let cld_upload_stream = cloudinary.uploader.upload_stream(
              { folder: "campusfoundit/found" },
              (error, result) => {
                if (result) {
                  resolve(result);
                } else {
                  reject(error);
                }
              }
            );
            streamifier.createReadStream(req.file.buffer).pipe(cld_upload_stream);
          });
        };
        const result = await uploadFromBuffer(req);
        photo_path = result.secure_url;
      } catch (err) {
        console.error('Cloudinary upload error:', err);
        return res.status(500).json({ success: false, message: 'Image upload failed.' });
      }
    }

    // Insert into database using the promise-based wrapper
    const sql = `
      INSERT INTO found_items (name, email, phone, item_name, category, color, brand, location_found, date_found, description, photo_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [name, email, phone, item_name, category, color, brand || null, location_found, date_found, description || null, photo_path];
    
    const result = await db.runQuery(sql, params);

    const newFoundId = result.lastInsertRowid;
    console.log(`🔍 New found item report #${newFoundId}: ${item_name}`);

    // Run the matching algorithm against all open lost items (async)
    const matchCount = await runMatching(newFoundId);
    console.log(`🔗 Found ${matchCount} potential match(es) for found item #${newFoundId}`);

    res.status(201).json({
      success: true,
      message: 'Found item report submitted successfully!',
      data: { id: newFoundId, matchesFound: matchCount }
    });
  } catch (error) {
    console.error('Error submitting found item:', error);
    res.status(500).json({
      success: false,
      message: 'Server error — could not submit report.'
    });
  }
});

module.exports = router;
