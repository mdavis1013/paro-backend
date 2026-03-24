const router = require('express').Router()
const pool   = require('../db/index')
const jwt    = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)

// POST /auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password required' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
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

// POST /auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })

  try {
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email])
    
    // Always return success even if email not found (security best practice)
    if (!result.rows.length) {
      return res.json({ message: 'If that email exists, a reset link has been sent' })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 1000 * 60 * 60) // 1 hour

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
      [token, expires, email]
    )

    const resetLink = `paroapp://reset-password?token=${token}`

    await resend.emails.send({
      from: 'paro <paro.noreply@gmail.com>',
      to: email,
      subject: 'Reset your paro password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #E8613C;">Reset your password</h2>
          <p>You requested a password reset for your paro account.</p>
          <p>Tap the button below to set a new password. This link expires in 1 hour.</p>
          <a href="${resetLink}" style="display: inline-block; background: #E8613C; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
            Reset password
          </a>
          <p style="color: #888; font-size: 13px;">If you didn't request this, you can ignore this email.</p>
        </div>
      `
    })

    res.json({ message: 'If that email exists, a reset link has been sent' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// POST /auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' })
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

  try {
    const result = await pool.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    )

    if (!result.rows.length) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired' })
    }

    const password_hash = await bcrypt.hash(password, 10)

    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [password_hash, result.rows[0].id]
    )

    res.json({ message: 'Password reset successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router