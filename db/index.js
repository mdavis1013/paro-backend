const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Supabase
})

pool.on('connect', () => {
  console.log('Connected to PostgreSQL')
})

module.exports = pool