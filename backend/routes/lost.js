// ─── routes/lost.js ───
// Handles all routes for lost item reports.
// POST /api/lost — submit a new lost item report (with optional photo upload)

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database');
const cloudinary = require('../utils/cloudinary');
const streamifier = require('streamifier');

// ─── Multer Setup for Photo Uploads ───
// Use memory storage to temporarily hold the file before uploading to Cloudinary
const storage = multer.memoryStorage();

// Only allow image file uploads
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
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

// ─── POST /api/lost ───
// Submit a new lost item report
router.post('/', upload.single('photo'), async (req, res) => {
  try {
    // Pull all fields from the request body
    const { name, email, phone, item_name, category, color, brand, location_lost, date_lost, description, hidden_detail } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !item_name || !category || !color || !location_lost || !date_lost || !hidden_detail) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields.'
      });
    }

    let photo_path = null;
    
    // Upload to Cloudinary if a photo was provided
    if (req.file) {
      try {
        const uploadFromBuffer = (req) => {
          return new Promise((resolve, reject) => {
            let cld_upload_stream = cloudinary.uploader.upload_stream(
              { folder: "campusfoundit/lost" },
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
        photo_path = result.secure_url; // Store the Cloudinary secure URL
      } catch (err) {
        console.error('Cloudinary upload error:', err);
        return res.status(500).json({ success: false, message: 'Image upload failed.' });
      }
    }

    // Insert into database using the promise-based wrapper
    const sql = `
      INSERT INTO lost_items (name, email, phone, item_name, category, color, brand, location_lost, date_lost, description, photo_path, hidden_detail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [name, email, phone, item_name, category, color, brand || null, location_lost, date_lost, description || null, photo_path, hidden_detail];
    
    const result = await db.runQuery(sql, params);

    console.log(`📋 New lost item report #${result.lastInsertRowid}: ${item_name}`);

    res.status(201).json({
      success: true,
      message: 'Lost item report submitted successfully!',
      data: { id: result.lastInsertRowid }
    });
  } catch (error) {
    console.error('Error submitting lost item:', error);
    res.status(500).json({
      success: false,
      message: 'Server error — could not submit report.'
    });
  }
});

module.exports = router;
