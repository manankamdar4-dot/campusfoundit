// ─── routes/admin.js ───
// All admin-only routes. Protected by checking the admin password
// sent in the x-admin-password request header.
//
// Routes:
// GET  /api/admin/lost          — all lost items (includes hidden detail)
// GET  /api/admin/found         — all found items (includes contact info)
// GET  /api/admin/matches       — all suggested matches with item details
// POST /api/admin/confirm-match — confirm a match and trigger emails
// POST /api/admin/dismiss-match — dismiss a suggested match
// POST /api/admin/mark-returned — mark an item as returned

const express = require('express');
const router = express.Router();
const db = require('../database');
const { sendMatchEmails } = require('../utils/mailer');

// ─── Auth Middleware ───
// Every admin route checks for the correct password in headers.
function requireAdmin(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Invalid admin password.' });
  }
  next();
}

// Apply the middleware to ALL routes in this file
router.use(requireAdmin);

// ─── GET /api/admin/lost ───
// Returns ALL lost items including hidden verification details.
router.get('/lost', async (req, res) => {
  try {
    const items = await db.query('SELECT * FROM lost_items ORDER BY created_at DESC');
    res.json({ success: true, data: items });
  } catch (error) {
    console.error('Error fetching admin lost items:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch lost items.' });
  }
});

// ─── GET /api/admin/found ───
// Returns ALL found items including finder's contact details.
router.get('/found', async (req, res) => {
  try {
    const items = await db.query('SELECT * FROM found_items ORDER BY created_at DESC');
    res.json({ success: true, data: items });
  } catch (error) {
    console.error('Error fetching admin found items:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch found items.' });
  }
});

// ─── GET /api/admin/matches ───
// Returns all suggested matches (unconfirmed) with full item details for both sides.
router.get('/matches', async (req, res) => {
  try {
    const matches = await db.query(`
      SELECT
        m.id AS match_id,
        m.similarity_score,
        m.confirmed,
        m.created_at AS match_date,
        l.id AS lost_id, l.name AS lost_name, l.email AS lost_email, l.phone AS lost_phone,
        l.item_name AS lost_item, l.category AS lost_category, l.color AS lost_color,
        l.brand AS lost_brand, l.location_lost, l.date_lost, l.description AS lost_description,
        l.photo_path AS lost_photo, l.hidden_detail, l.status AS lost_status,
        f.id AS found_id, f.name AS found_name, f.email AS found_email, f.phone AS found_phone,
        f.item_name AS found_item, f.category AS found_category, f.color AS found_color,
        f.brand AS found_brand, f.location_found, f.date_found, f.description AS found_description,
        f.photo_path AS found_photo, f.status AS found_status
      FROM matches m
      JOIN lost_items l ON m.lost_id = l.id
      JOIN found_items f ON m.found_id = f.id
      ORDER BY m.similarity_score DESC, m.created_at DESC
    `);

    res.json({ success: true, data: matches });
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch matches.' });
  }
});

// ─── POST /api/admin/confirm-match ───
// Confirm a suggested match. Updates statuses and sends email notifications.
router.post('/confirm-match', async (req, res) => {
  try {
    const { match_id } = req.body;

    if (!match_id) {
      return res.status(400).json({ success: false, message: 'match_id is required.' });
    }

    // Get the match record
    const match = await db.getOne('SELECT * FROM matches WHERE id = ?', [match_id]);
    if (!match) {
      return res.status(404).json({ success: false, message: 'Match not found.' });
    }

    // Update match as confirmed
    await db.runQuery('UPDATE matches SET confirmed = 1 WHERE id = ?', [match_id]);

    // Update lost item status to 'matched'
    await db.runQuery("UPDATE lost_items SET status = 'matched' WHERE id = ?", [match.lost_id]);

    // Update found item status to 'matched'
    await db.runQuery("UPDATE found_items SET status = 'matched' WHERE id = ?", [match.found_id]);

    // Get full details for email
    const lostItem = await db.getOne('SELECT * FROM lost_items WHERE id = ?', [match.lost_id]);
    const foundItem = await db.getOne('SELECT * FROM found_items WHERE id = ?', [match.found_id]);

    // Send notification emails to both parties
    try {
      await sendMatchEmails(lostItem, foundItem);
      console.log(`✉️ Match #${match_id} confirmed — emails sent.`);
    } catch (emailErr) {
      console.error('Email sending failed (match still confirmed):', emailErr);
    }

    res.json({
      success: true,
      message: 'Match confirmed and notifications sent!',
      data: { match_id, lost_id: match.lost_id, found_id: match.found_id }
    });
  } catch (error) {
    console.error('Error confirming match:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm match.' });
  }
});

// ─── POST /api/admin/dismiss-match ───
// Remove a suggested match that isn't a real match.
router.post('/dismiss-match', async (req, res) => {
  try {
    const { match_id } = req.body;

    if (!match_id) {
      return res.status(400).json({ success: false, message: 'match_id is required.' });
    }

    // Delete the match record
    const result = await db.runQuery('DELETE FROM matches WHERE id = ? AND confirmed = 0', [match_id]);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Match not found or already confirmed.' });
    }

    console.log(`❌ Match #${match_id} dismissed.`);
    res.json({ success: true, message: 'Match dismissed.' });
  } catch (error) {
    console.error('Error dismissing match:', error);
    res.status(500).json({ success: false, message: 'Failed to dismiss match.' });
  }
});

// ─── POST /api/admin/mark-returned ───
// Mark a confirmed match as returned — the owner got their item back.
router.post('/mark-returned', async (req, res) => {
  try {
    const { match_id } = req.body;

    if (!match_id) {
      return res.status(400).json({ success: false, message: 'match_id is required.' });
    }

    // Get the match
    const match = await db.getOne('SELECT * FROM matches WHERE id = ? AND confirmed = 1', [match_id]);
    if (!match) {
      return res.status(404).json({ success: false, message: 'Confirmed match not found.' });
    }

    // Update both items to 'returned'
    await db.runQuery("UPDATE lost_items SET status = 'returned' WHERE id = ?", [match.lost_id]);
    await db.runQuery("UPDATE found_items SET status = 'returned' WHERE id = ?", [match.found_id]);

    console.log(`🎉 Match #${match_id} marked as returned!`);
    res.json({
      success: true,
      message: 'Item marked as returned!',
      data: { match_id, lost_id: match.lost_id, found_id: match.found_id }
    });
  } catch (error) {
    console.error('Error marking returned:', error);
    res.status(500).json({ success: false, message: 'Failed to mark as returned.' });
  }
});

module.exports = router;
