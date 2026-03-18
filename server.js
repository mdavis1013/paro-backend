if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const express = require('express')
const cors    = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

app.use('/auth',     require('./routes/auth'))
app.use('/users',    require('./routes/users'))
app.use('/matching', require('./routes/matching'))

app.get('/', (req, res) => {
  res.json({ status: 'Paro API is running' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})