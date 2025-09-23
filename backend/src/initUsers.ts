import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { DB_ADDRESS } from './config';
import User from './models/user';
import { Role } from './models/user';

async function initTestUsers() {
  try {
    // Подключение к базе с параметрами аутентификации
    await mongoose.connect(DB_ADDRESS, {
      auth: {
        username: 'root',
        password: 'example'
      },
      authSource: 'admin'
    });
    console.log('Connected to MongoDB');

    // Удаляем старых пользователей если есть
    await User.deleteMany({
      email: { 
        $in: ["admin@mail.ru", "user1@mail.ru"] 
      }
    });
    console.log('Old test users removed');

    // Создаем админа
    const adminPassword = await bcrypt.hash('password', 10);
    const admin = new User({
      name: 'Admin',
      email: 'admin@mail.ru',
      password: adminPassword,
      roles: [Role.Admin]
    });
    await admin.save();
    console.log('Admin user created:', admin.email);

    // Создаем обычного пользователя
    const user1Password = await bcrypt.hash('password1', 10);
    const user1 = new User({
      name: 'First Customer',
      email: 'user1@mail.ru',
      password: user1Password,
      roles: [Role.Customer]
    });
    await user1.save();
    console.log('User1 created:', user1.email);

    console.log('Test users initialized successfully!');
  } catch (error) {
    console.error('Error initializing test users:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

initTestUsers();