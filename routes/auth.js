const router = require('express').Router()
const pool   = require('../db/index')
const jwt    = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

// POST /auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password required' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }

  try {
    const password_hash = await bcrypt.hash(password, 10)

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name, email, password_hash]
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
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' })
  }

  try {
    const result = await pool.query(
      `SELECT id, name, email, password_hash FROM users WHERE email = $1`,
      [email]
    )
    if (!result.rows.length) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = result.rows[0]

    // Handle old accounts with no password set
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Account has no password set. Please register again.' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password' })
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({ user: { id: user.id, name: user.name, email: user.email }, token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /auth/check-email
router.post('/check-email', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })
  const result = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  res.json({ exists: result.rows.length > 0 })
})

module.exports = router