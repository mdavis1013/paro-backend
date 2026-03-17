const router = require('express').Router()
const pool   = require('../db/index')
const verify = require('../middleware/auth')

// GET /matching/nearby  — the core query
router.get('/nearby', verify, async (req, res) => {
  const { lat, lng, radius_km = 50 } = req.query
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' })

  try {
    // Get current user's tags first
    const tagResult = await pool.query(
      `SELECT tag_id FROM user_tags WHERE user_id = $1`,
      [req.userId]
    )
    const tagIds = tagResult.rows.map(r => r.tag_id)
    if (!tagIds.length) return res.json({ users: [], message: 'Add some tags to your profile first' })

    // The core geo + tag matching query
    const result = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.avatar_url,
         u.city_label,
         COUNT(ut.tag_id)                              AS shared_tag_count,
         ARRAY_AGG(t.name)                             AS shared_tags,
         ST_Distance(u.location,
           ST_MakePoint($1, $2)::geography)            AS distance_m
       FROM users u
       JOIN user_tags ut ON u.id      = ut.user_id
       JOIN tags      t  ON ut.tag_id = t.id
       WHERE
         u.id != $3
         AND u.is_visible = TRUE
         AND ut.tag_id = ANY($4::uuid[])
         AND ST_DWithin(
               u.location,
               ST_MakePoint($1, $2)::geography,
               $5
             )
       GROUP BY u.id, u.name, u.avatar_url, u.city_label, u.location
       ORDER BY shared_tag_count DESC, distance_m ASC`,
      [lng, lat, req.userId, tagIds, radius_km * 1000]
    )

    res.json({ users: result.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router