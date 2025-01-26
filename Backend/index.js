const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const bodyParser = require('body-parser');

// Initialize Express
const app = express();
app.use(bodyParser.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI; // Your MongoDB URI from environment variable
const BOT_TOKEN = process.env.BOT_TOKEN; // Your Telegram Bot Token from environment variable

if (!MONGO_URI || !BOT_TOKEN) {
  console.error('MongoDB URI or Bot Token not provided.');
  process.exit(1); // Exit if the required environment variables are not set
}

mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true },
  firstName: String,
  lastName: String,
  username: String,
  photoUrl: String,
  balance: { type: Number, default: 0 },
  referralCount: { type: Number, default: 0 },
  referralBonus: { type: Number, default: 0 },
  tasks: [
    {
      taskId: String,
      description: String,
      completed: { type: Boolean, default: false },
    },
  ],
});

const User = mongoose.model('User', userSchema);

// Telegram Authorization Endpoint
app.post('/auth', async (req, res) => {
  const { hash, ...data } = req.body;

  const secret = crypto
    .createHash('sha256')
    .update(BOT_TOKEN)
    .digest();

  const checkString = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join('\n');

  const hmac = crypto.createHmac('sha256', secret).update(checkString).digest('hex');

  if (hmac !== hash) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { id: telegramId, first_name: firstName, last_name: lastName, username, photo_url: photoUrl } = data;

  let user = await User.findOne({ telegramId });

  if (!user) {
    user = new User({ telegramId, firstName, lastName, username, photoUrl });
    await user.save();
  }

  res.json({ success: true, message: 'Authorization successful', user });
});

// Task Management: Add a New Task
app.post('/tasks/add', async (req, res) => {
  const { telegramId, taskId, description } = req.body;

  if (!telegramId || !taskId || !description) {
    return res.status(400).json({ success: false, message: 'Invalid task data' });
  }

  const user = await User.findOne({ telegramId });

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (user.tasks.some((task) => task.taskId === taskId)) {
    return res.status(400).json({ success: false, message: 'Task already exists' });
  }

  user.tasks.push({ taskId, description });
  await user.save();

  res.json({ success: true, message: 'Task added successfully', tasks: user.tasks });
});

// Task Management: Retrieve Tasks
app.get('/tasks', async (req, res) => {
  const { telegramId } = req.query;

  if (!telegramId) {
    return res.status(400).json({ success: false, message: 'Telegram ID is required' });
  }

  const user = await User.findOne({ telegramId });

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  res.json({ success: true, tasks: user.tasks });
});

// Task Management: Mark a Task as Done
app.post('/tasks/complete', async (req, res) => {
  const { telegramId, taskId } = req.body;

  if (!telegramId || !taskId) {
    return res.status(400).json({ success: false, message: 'Invalid task data' });
  }

  const user = await User.findOne({ telegramId });

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const task = user.tasks.find((task) => task.taskId === taskId);

  if (!task) {
    return res.status(404).json({ success: false, message: 'Task not found' });
  }

  task.completed = true;
  await user.save();

  res.json({ success: true, message: 'Task marked as complete', tasks: user.tasks });
});

// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
