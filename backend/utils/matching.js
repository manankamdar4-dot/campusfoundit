// ─── utils/matching.js ───
// Matching algorithm for CampusFoundIt.
// Compares a newly submitted found item against all open lost items.
// Uses a point-based scoring system to suggest potential matches.
//
// Scoring:
//   Category exact match     → +40 points
//   Color exact match        → +30 points
//   Item name keyword match  → +20 points (word overlap)
//   Location exact match     → +10 points
//
// Threshold: >= 50 points to be flagged as a potential match.

const db = require('../database');

/**
 * Run the matching algorithm for a specific found item.
 * Compares it against all lost items with status = 'open'.
 *
 * @param {number} foundId - The ID of the newly submitted found item.
 * @returns {Promise<number>} The number of matches created.
 */
async function runMatching(foundId) {
  // Get the found item details using the promise-based wrapper
  const foundItem = await db.getOne('SELECT * FROM found_items WHERE id = ?', [foundId]);

  if (!foundItem) {
    console.error(`Found item #${foundId} not found in database.`);
    return 0;
  }

  // Get all open (unmatched) lost items
  const openLostItems = await db.query("SELECT * FROM lost_items WHERE status = 'open'");

  let matchCount = 0;

  // Compare the found item against each open lost item
  for (const lostItem of openLostItems) {
    let score = 0;

    // 1. Category exact match → +40 points
    if (lostItem.category.toLowerCase() === foundItem.category.toLowerCase()) {
      score += 40;
    }

    // 2. Color exact match → +30 points
    if (lostItem.color.toLowerCase() === foundItem.color.toLowerCase()) {
      score += 30;
    }

    // 3. Item name keyword overlap → +20 points
    // Split both item names into words and check for common words
    const lostWords = lostItem.item_name.toLowerCase().split(/\s+/);
    const foundWords = foundItem.item_name.toLowerCase().split(/\s+/);
    const hasOverlap = lostWords.some(word => foundWords.includes(word) && word.length > 2);
    if (hasOverlap) {
      score += 20;
    }

    // 4. Location match → +10 points
    // Compare lost location with found location
    if (lostItem.location_lost.toLowerCase() === foundItem.location_found.toLowerCase()) {
      score += 10;
    }

    // If score meets the threshold, save as a potential match
    if (score >= 50) {
      // Check if this pair already exists in matches to avoid duplicates
      const exists = await db.getOne(
        'SELECT id FROM matches WHERE lost_id = ? AND found_id = ?',
        [lostItem.id, foundId]
      );

      if (!exists) {
        await db.runQuery(
          'INSERT INTO matches (lost_id, found_id, similarity_score) VALUES (?, ?, ?)',
          [lostItem.id, foundId, score]
        );
        matchCount++;
        console.log(`  → Match: Lost #${lostItem.id} ↔ Found #${foundId} (score: ${score})`);
      }
    }
  }

  return matchCount;
}

module.exports = { runMatching };
