const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

// GET /messages/conversations
router.get('/conversations', authenticateToken, async (req, res) => {
  const userId = req.userId;
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.created_at,
        CASE WHEN c.user1_id = $1 THEN u2.id ELSE u1.id END AS other_user_id,
        CASE WHEN c.user1_id = $1 THEN u2.name ELSE u1.name END AS other_user_name,
        m.content AS last_message,
        m.created_at AS last_message_at
      FROM conversations c
      JOIN users u1 ON u1.id = c.user1_id
      JOIN users u2 ON u2.id = c.user2_id
      LEFT JOIN LATERAL (
        SELECT content, created_at FROM chat_messages
        WHERE conversation_id = c.id
        ORDER BY created_at DESC LIMIT 1
      ) m ON true
      WHERE c.user1_id = $1 OR c.user2_id = $1
      ORDER BY COALESCE(m.created_at, c.created_at) DESC
    `, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /messages/conversations
router.post('/conversations', authenticateToken, async (req, res) => {
  const myId = req.userId;
  const { other_user_id } = req.body;
  if (!other_user_id) return res.status(400).json({ error: 'other_user_id required' });

  const user1_id = myId < other_user_id ? myId : other_user_id;
  const user2_id = myId < other_user_id ? other_user_id : myId;

  try {
    const result = await pool.query(`
      INSERT INTO conversations (user1_id, user2_id)
      VALUES ($1, $2)
      ON CONFLICT (user1_id, user2_id) DO UPDATE SET user1_id = EXCLUDED.user1_id
      RETURNING id, created_at
    `, [user1_id, user2_id]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /messages/conversations/:id
router.get('/conversations/:id', authenticateToken, async (req, res) => {
  const userId = req.userId;
  const convId = req.params.id;
  try {
    const check = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
      [convId, userId]
    );
    if (check.rowCount === 0) return res.status(403).json({ error: 'Forbidden' });

    const result = await pool.query(`
      SELECT id, sender_id, content, created_at
      FROM chat_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `, [convId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /messages/conversations/:id
router.post('/conversations/:id', authenticateToken, async (req, res) => {
  const userId = req.userId;
  const convId = req.params.id;
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });

  try {
    const check = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
      [convId, userId]
    );
    if (check.rowCount === 0) return res.status(403).json({ error: 'Forbidden' });

    const result = await pool.query(`
      INSERT INTO chat_messages (conversation_id, sender_id, content)
      VALUES ($1, $2, $3)
      RETURNING id, sender_id, content, created_at
    `, [convId, userId, content.trim()]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;