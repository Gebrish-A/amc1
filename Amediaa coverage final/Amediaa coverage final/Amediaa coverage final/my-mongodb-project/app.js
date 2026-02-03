const mongoose = require('mongoose');

// Connection URI
const mongoURI = 'mongodb://localhost:27017/myDatabase';

// Connect to MongoDB
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully!'))
.catch(err => console.error('MongoDB connection error:', err));

// Define a Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true },
  age: Number,
  createdAt: { type: Date, default: Date.now }
});

// Create a Model
const User = mongoose.model('User', userSchema);

// Create and save a document
async function createUser() {
  try {
    const user = new User({
      name: "Jane Smith",
      email: "jane@example.com",
      age: 30
    });
    
    await user.save();
    console.log('User saved:', user);
    
    // Find all users
    const users = await User.find();
    console.log('All users:', users);
    
    // Close connection (optional)
    mongoose.connection.close();
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createUser();