require('dotenv').config()
const express = require('express')
const cors    = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

// Routes (we'll fill these in next)
app.use('/auth',     require('./routes/auth'))
app.use('/users',    require('./routes/users'))
app.use('/matching', require('./routes/matching'))

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Rootsy API is running' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})