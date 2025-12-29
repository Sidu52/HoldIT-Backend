import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';


export const connectMongo = async () => {
  try {
    const url = process.env.MONGODB_URI;

    if (!url) {
      throw new Error('MONGODB_URI is not defined in .env');
    }

    await mongoose.connect(url);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1); 
  }
};

