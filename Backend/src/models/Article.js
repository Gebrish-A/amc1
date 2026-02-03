// models/Article.js
const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true
  },
  content: {
    type: String,
    default: ''
  },
  writer: {
    name: String,
    email: String,
    writerId: String
  },
  status: {
    type: String,
    enum: ['draft', 'in-progress', 'review', 'published', 'rejected'],
    default: 'draft'
  },
  category: {
    type: String,
    enum: ['news', 'sports', 'entertainment', 'business', 'technology'],
    default: 'news'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  deadline: Date,
  wordCount: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },
  tags: [String],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update word count and updatedAt before saving
articleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (this.content) {
    this.wordCount = this.content.split(/\s+/).length;
  }
  next();
});

module.exports = mongoose.model('Article', articleSchema);