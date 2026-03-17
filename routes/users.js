const router = require('express').Router()
const pool   = require('../db/index')
const verify = require('../middleware/auth')

// GET /users/me  — get your own profile
router.get('/me', verify, async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT id, name, email, avatar_url, bio, city_label
       FROM users WHERE id = $1`,
      [req.userId]
    );

    const tagsResult = await pool.query(
      `SELECT t.name AS tag_name, t.type AS tag_type
      FROM user_tags ut
      JOIN tags t ON ut.tag_id = t.id
      WHERE ut.user_id = $1`,
      [req.userId]
    );

    res.json({
      ...userResult.rows[0],
      tags: tagsResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /users/me/location  — update location
router.patch('/me/location', verify, async (req, res) => {
  const { lat, lng, city_label } = req.body
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' })

  try {
    await pool.query(
      `UPDATE users
       SET location   = ST_MakePoint($1, $2)::geography,
           city_label = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [lng, lat, city_label, req.userId]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /users/me/tags  — add a tag to your profile
router.post('/me/tags', verify, async (req, res) => {
  const { tag_name, tag_type } = req.body;
  if (!tag_name || !tag_type) return res.status(400).json({ error: 'tag_name and tag_type required' });

  try {
    // find or create the tag
    const tagResult = await pool.query(
      `INSERT INTO tags (name, type)
       VALUES ($1, $2)
       ON CONFLICT (name, type) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [tag_name, tag_type]
    );

    const tag_id = tagResult.rows[0].id;

    // link tag to user
    await pool.query(
      `INSERT INTO user_tags (user_id, tag_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.userId, tag_id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router