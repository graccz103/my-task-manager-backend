const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');

// Importowanie komponentów
const userRoutes = require('./server_components/user');
const groupRoutes = require('./server_components/group');
const taskRoutes = require('./server_components/task');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Połączenie z MongoDB
mongoose
  .connect('mongodb://127.0.0.1:27017/mytaskmanager', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Korzystanie z komponentów
app.use('/users', userRoutes);
app.use('/groups', groupRoutes);
app.use('/tasks', taskRoutes);

// Start serwera
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
