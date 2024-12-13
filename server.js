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
  status: { type: String, enum: ['To Do', 'In Progress', 'In Review', 'Done'], default: 'To Do' },
  dueDate: { type: Date },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true }, // Powiązanie z grupą
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Twórca zadania
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Przypisany użytkownik
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

// Pobranie zadań grupy
app.get('/tasks', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('Access denied');

    const decoded = jwt.verify(token, 'secretkey');
    const currentUser = await User.findById(decoded.id).populate('groupId');

    if (!currentUser.groupId) {
      return res.status(403).send('You are not part of any group');
    }

    const tasks = await Task.find({ groupId: currentUser.groupId._id })
      .populate('createdBy', 'username email') // Twórca zadania
      .populate('assignedTo', 'username email'); // Przypisany użytkownik

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Failed to fetch tasks', error });
  }
});





// Tworzenie zadania w grupie
app.post('/tasks', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('Access denied');

    const decoded = jwt.verify(token, 'secretkey');
    const currentUser = await User.findById(decoded.id).populate('groupId');

    if (!currentUser.groupId) {
      return res.status(403).send('You must be part of a group to create a task');
    }

    const { title, description, status, dueDate, assignedTo } = req.body;

    const newTask = new Task({
      title,
      description,
      status,
      dueDate,
      groupId: currentUser.groupId._id, // Powiązanie z grupą
      createdBy: currentUser._id, // Twórca zadania
      assignedTo: assignedTo || null, // Użytkownik przypisany do zadania (opcjonalne)
    });

    await newTask.save();
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ message: 'Failed to create task', error });
  }
});


app.get('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await Task.findById(taskId)
      .populate('createdBy', 'username email')
      .populate('assignedTo', 'username email'); // Przypisany użytkownik
    if (!task) return res.status(404).send('Task not found');
    res.status(200).json(task);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch task details', error });
  }
});


app.put('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { title, description, status, dueDate, assignedTo } = req.body;

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      { title, description, status, dueDate, assignedTo },
      { new: true, runValidators: true }
    );

    if (!updatedTask) {
      return res.status(404).send('Task not found');
    }

    res.status(200).json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ message: 'Failed to update task', error });
  }
});

// Usuwanie zadania
app.delete('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    const deletedTask = await Task.findByIdAndDelete(taskId);

    if (!deletedTask) {
      return res.status(404).send('Task not found');
    }

    res.status(200).send('Task deleted successfully');
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ message: 'Failed to delete task', error });
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

    const group = await Group.findById(user.groupId);
    if (!group) return res.status(404).send('Group not found');

    // Usuń użytkownika z grupy
    group.members = group.members.filter((memberId) => !memberId.equals(user._id));
    await group.save();

    // Usuń grupę z użytkownika
    user.groupId = null;
    await user.save();

    // Jeśli grupa jest pusta, usuń ją
    if (group.members.length === 0) {
      await Group.findByIdAndDelete(group._id);
      console.log(`Group "${group.name}" has been deleted as it has no members.`);
    }

    res.send('You have left the group');
  } catch (error) {
    res.status(500).json({ message: 'Failed to leave group', error });
  }
});


app.patch('/groups/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, addMembers, removeMembers } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).send('Group not found');

    // Zmiana nazwy grupy
    if (name) {
      group.name = name;
    }

    // Dodanie nowych członków
    if (addMembers && addMembers.length > 0) {
      const newMembers = await User.find({ _id: { $in: addMembers }, groupId: null });
      newMembers.forEach((member) => {
        group.members.push(member._id);
        member.groupId = group._id;
        member.save();
      });
    }

    // Usuwanie członków
    if (removeMembers && removeMembers.length > 0) {
      group.members = group.members.filter((memberId) => !removeMembers.includes(memberId.toString()));
      await User.updateMany({ _id: { $in: removeMembers } }, { groupId: null });
    }

    // Jeśli grupa jest pusta po aktualizacji, usuń ją
    if (group.members.length === 0) {
      await Group.findByIdAndDelete(group._id);
      console.log(`Group "${group.name}" has been deleted as it has no members.`);
      return res.status(200).send('Group has been deleted as it has no members');
    }

    await group.save();
    res.status(200).json(group);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update group', error });
  }
});


app.get('/groups', async (req, res) => {
  try {
    const groups = await Group.find().populate('members', 'username email');
    res.status(200).json(groups);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch groups', error });
  }
});

app.get('/groups/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId).populate('members', 'username email');
    if (!group) return res.status(404).send('Group not found');
    res.status(200).json(group);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch group details', error });
  }
});

app.get('/groups/:groupId/members', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId).populate('members', 'username email');
    if (!group) return res.status(404).send('Group not found');
    res.status(200).json(group.members);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch group members', error });
  }
});


app.post('/groups/:groupId/join', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('Access denied');

    const decoded = jwt.verify(token, 'secretkey');
    const user = await User.findById(decoded.id);
    if (user.groupId) return res.status(400).send('You are already in a group');

    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).send('Group not found');

    // Dodaj użytkownika do grupy
    group.members.push(user._id);
    await group.save();

    // Aktualizuj użytkownika
    user.groupId = group._id;
    await user.save();

    res.status(200).send('Successfully joined the group');
  } catch (error) {
    res.status(500).json({ message: 'Failed to join group', error });
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
