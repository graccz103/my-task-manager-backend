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
  password: String,
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' } // Dodanie grupy
}));

const Group = mongoose.model('Group', new mongoose.Schema({
  name: { type: String, required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] // Członkowie grupy
}));

const Task = mongoose.model('Task', new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['To Do', 'In Progress', 'Done'], default: 'To Do' },
  dueDate: { type: Date },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
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
    const currentUser = await User.findById(decoded.id).populate('groupId');
    if (!currentUser.groupId) {
      // Brak grupy, zwracamy tylko zadania użytkownika
      const tasks = await Task.find({ userId: currentUser._id }).populate('assignedTo', 'username email');
      return res.json(tasks);
    }

    // Pobieramy użytkowników z tej samej grupy
    const groupMembers = await User.find({ groupId: currentUser.groupId._id });
    const memberIds = groupMembers.map(member => member._id);

    // Pobieramy zadania przypisane do członków grupy
    const tasks = await Task.find({ userId: { $in: memberIds } }).populate('assignedTo', 'username email');
    res.json(tasks);
  } catch (error) {
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

app.post('/groups', async (req, res) => {
  try {
    const { name, memberIds } = req.body;

    // Sprawdzenie, czy którykolwiek z użytkowników już należy do grupy
    const existingMembers = await User.find({ _id: { $in: memberIds }, groupId: { $ne: null } });
    if (existingMembers.length > 0) {
      return res.status(400).json({
        message: 'Some users are already in a group',
        existingMembers
      });
    }

    const group = new Group({ name, members: memberIds });
    await group.save();

    // Przypisanie użytkowników do nowej grupy
    await User.updateMany({ _id: { $in: memberIds } }, { groupId: group._id });

    res.status(201).json(group);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create group', error });
  }
});

app.post('/leave-group', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('Access denied');

    const decoded = jwt.verify(token, 'secretkey');
    const user = await User.findById(decoded.id);
    if (!user.groupId) return res.status(400).send('You are not in a group');

    // Usuń użytkownika z grupy
    const group = await Group.findById(user.groupId);
    group.members = group.members.filter((memberId) => !memberId.equals(user._id));
    await group.save();

    // Usuń grupę z użytkownika
    user.groupId = null;
    await user.save();

    res.send('You have left the group');
  } catch (error) {
    res.status(500).json({ message: 'Failed to leave group', error });
  }
});


// szczegóły o "mnie" użytkowniku, dane grupy
app.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('Access denied');

    const decoded = jwt.verify(token, 'secretkey');
    const user = await User.findById(decoded.id).populate('groupId');
    if (!user) return res.status(404).send('User not found');

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch user data', error });
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

// Użytkownicy którzy nie mają grupy
app.get('/available-users', async (req, res) => {
  try {
    const users = await User.find({ groupId: null });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users', error });
  }
});


// Start serwera
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
