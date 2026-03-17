const jwt = require('jsonwebtoken')

module.exports = (req, res, next) => {
  const header = req.headers['authorization']
  if (!header) return res.status(401).json({ error: 'No token provided' })

  const token = header.split(' ')[1]  // expects "Bearer <token>"
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.userId = decoded.id
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}