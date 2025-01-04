const express = require('express');
const jwt = require('jsonwebtoken');
const Task = require('../models/Task');
const User = require('../models/User');

const router = express.Router();

// Pobranie zadań grupy
router.get('/', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('Access denied');

    const decoded = jwt.verify(token, 'secretkey');
    const currentUser = await User.findById(decoded.id).populate('groupId');

    if (!currentUser.groupId) {
      return res.status(403).send('You are not part of any group');
    }

    const tasks = await Task.find({ groupId: currentUser.groupId._id })
      .populate('createdBy', 'username email')
      .populate('assignedTo', 'username email');

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Failed to fetch tasks', error });
  }
});

// Tworzenie zadania
router.post('/', async (req, res) => {
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
      groupId: currentUser.groupId._id,
      createdBy: currentUser._id,
      assignedTo: assignedTo || null,
    });

    await newTask.save();
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ message: 'Failed to create task', error });
  }
});

// Aktualizacja zadania
router.put('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('Access denied');

    const decoded = jwt.verify(token, 'secretkey');
    const currentUser = await User.findById(decoded.id);

    if (!currentUser) {
      return res.status(404).send('User not found');
    }

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      req.body, // Wykorzystanie przesłanych danych do aktualizacji zadania
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

// Pobranie szczegółów zadania
router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('Access denied');

    const decoded = jwt.verify(token, 'secretkey');
    const currentUser = await User.findById(decoded.id).populate('groupId');

    if (!currentUser.groupId) {
      return res.status(403).send('You are not part of any group');
    }

    const task = await Task.findById(taskId)
      .populate('createdBy', 'username email')
      .populate('assignedTo', 'username email');

    if (!task) return res.status(404).send('Task not found');

    res.status(200).json(task);
  } catch (error) {
    console.error('Error fetching task details:', error);
    res.status(500).json({ message: 'Failed to fetch task details', error });
  }
});


// Usuwanie zadania
router.delete('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const deletedTask = await Task.findByIdAndDelete(taskId);
    if (!deletedTask) return res.status(404).send('Task not found');
    res.status(200).send('Task deleted successfully');
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ message: 'Failed to delete task', error });
  }
});


// Obsługa Załączników

const multer = require('multer');
const path = require('path');

// Konfiguracja multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

router.post('/upload/:taskId', upload.single('file'), async (req, res) => {
  const { taskId } = req.params;

  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  try {
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).send('Task not found.');
    }

    // Dodajemy ścieżkę pliku do attachments
    const filePath = `/uploads/${req.file.filename}`;
    task.attachments.push(filePath);
    await task.save();

    res.status(200).json({ filePath });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ message: 'Error uploading file', error });
  }
});




module.exports = router;
