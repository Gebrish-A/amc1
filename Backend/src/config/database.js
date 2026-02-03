const mongoose = require('mongoose');
const { initializeDatabase } = require('../models');

const connectDatabase = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Initialize database with default data
    await initializeDatabase();
    
    // Event listeners for database
    mongoose.connection.on('error', (err) => {
      console.error(`❌ MongoDB Error: ${err}`);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB Disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB Reconnected');
    });
    
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

// Graceful shutdown
const disconnectDatabase = async () => {
  try {
    await mongoose.disconnect();
    console.log('🔌 MongoDB Disconnected');
  } catch (error) {
    console.error('❌ Error disconnecting MongoDB:', error);
  }
};

module.exports = { connectDatabase, disconnectDatabase };