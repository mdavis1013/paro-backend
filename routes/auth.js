const router = require('express').Router()
const pool   = require('../db/index')
const jwt    = require('jsonwebtoken')

// POST /auth/register
router.post('/register', async (req, res) => {
  const { name, email } = req.body
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' })

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email)
       VALUES ($1, $2)
       RETURNING id, name, email, created_at`,
      [name, email]
    )
    const user  = result.rows[0]
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({ user, token })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' })
    res.status(500).json({ error: err.message })
  }
})

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })

  try {
    const result = await pool.query(
      `SELECT id, name, email FROM users WHERE email = $1`,
      [email]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' })

    const user  = result.rows[0]
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({ user, token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router