const express = require('express');
const jwt = require('jsonwebtoken');
const Group = require('../models/Group');
const User = require('../models/User');

const router = express.Router();

// Tworzenie nowej grupy
router.post('/', async (req, res) => {
  try {
    const { name, memberIds } = req.body;

    // Sprawdzenie, czy którykolwiek z użytkowników już należy do grupy
    const existingMembers = await User.find({ _id: { $in: memberIds }, groupId: { $ne: null } });
    if (existingMembers.length > 0) {
      return res.status(400).json({
        message: 'Some users are already in a group',
        existingMembers,
      });
    }

    const group = new Group({ name, members: memberIds });
    await group.save();

    // Przypisanie użytkowników do nowej grupy
    await User.updateMany({ _id: { $in: memberIds } }, { groupId: group._id });

    res.status(201).json(group);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ message: 'Failed to create group', error });
  }
});

// Pobieranie listy grup
router.get('/', async (req, res) => {
  try {
    const groups = await Group.find().populate('members', 'username email');
    res.status(200).json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ message: 'Failed to fetch groups', error });
  }
});

// Pobieranie szczegółów grupy
router.get('/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId).populate('members', 'username email');
    if (!group) return res.status(404).send('Group not found');
    res.status(200).json(group);
  } catch (error) {
    console.error('Error fetching group details:', error);
    res.status(500).json({ message: 'Failed to fetch group details', error });
  }
});

// Pobieranie członków grupy
router.get('/:groupId/members', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId).populate('members', 'username email');
    if (!group) return res.status(404).send('Group not found');
    res.status(200).json(group.members);
  } catch (error) {
    console.error('Error fetching group members:', error);
    res.status(500).json({ message: 'Failed to fetch group members', error });
  }
});

// Aktualizacja grupy
router.patch('/:groupId', async (req, res) => {
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
    console.error('Error updating group:', error);
    res.status(500).json({ message: 'Failed to update group', error });
  }
});

// Dołączanie użytkownika do grupy
router.post('/:groupId/join', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('Access denied');

    const decoded = jwt.verify(token, 'secretkey');
    const user = await User.findById(decoded.id);

    if (user.groupId) {
      return res.status(400).send('You are already in a group');
    }

    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).send('Group not found');

    group.members.push(user._id);
    user.groupId = group._id;

    await group.save();
    await user.save();

    res.status(200).send('Successfully joined the group');
  } catch (error) {
    console.error('Error joining group:', error);
    res.status(500).json({ message: 'Failed to join group', error });
  }
});


// Opuszczanie grupy
router.post('/leave', async (req, res) => {
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
    console.error('Error leaving group:', error);
    res.status(500).json({ message: 'Failed to leave group', error });
  }
});

module.exports = router;
