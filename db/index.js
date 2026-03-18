const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false,
})

pool.on('connect', () => {
  console.log('Connected to PostgreSQL')
})

pool.on('error', (err) => {
  console.error('Database error:', err.message)
})

pool.query('SELECT 1').then(() => {
  console.log('Database connection verified')
}).catch(err => {
  console.error('Database connection failed:', err.message)
})

module.exports = pool