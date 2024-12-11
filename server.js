const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Joi = require('joi'); // Import Joi

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Połączenie z MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/mytaskmanager')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Modele
const User = mongoose.model('User', new mongoose.Schema({
  username: String,
  email: String,
  password: String
}));

const Task = mongoose.model('Task', new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['To Do', 'In Progress', 'Done'], default: 'To Do' },
  dueDate: { type: Date },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // Nowe pole
}));


// Schematy walidacji Joi
const registerSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

// Rejestracja
app.post('/register', async (req, res) => {
  try {
    const { error } = registerSchema.validate(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    const { username, email, password } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();
    res.status(201).send('User registered');
  } catch (error) {
    res.status(500).json(error);
  }
});

// Logowanie
app.post('/login', async (req, res) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send('User not found');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send('Invalid credentials');

    const token = jwt.sign({ id: user._id }, 'secretkey', { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    res.status(500).json(error);
  }
});

// Pobranie zadań
app.get('/tasks', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('Access denied');

    const decoded = jwt.verify(token, 'secretkey');
    const tasks = await Task.find({ userId: decoded.id }).populate('assignedTo', 'username email');
    console.log('Fetched tasks:', tasks); // Loguj zadania
    res.json(tasks);
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    res.status(500).json({ message: 'Failed to fetch tasks', error });
  }
});


// Tworzenie zadań
app.post('/tasks', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('Access denied');

    const decoded = jwt.verify(token, 'secretkey');
    const { title, description, status, dueDate, assignedTo } = req.body; // Dodano assignedTo

    const newTask = new Task({
      title,
      description,
      status,
      dueDate,
      userId: decoded.id,
      assignedTo: assignedTo || null, // Jeśli brak przypisania, ustaw null
    });

    await newTask.save();
    res.status(201).json(newTask);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create task', error });
  }
});

// Pobierz wszystkich użytkowników
app.get('/users', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users', error });
  }
});

// Start serwera
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
