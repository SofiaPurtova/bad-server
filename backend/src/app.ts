import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import xss from 'xss';
import csurf from 'csurf';

import { errors } from 'celebrate'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'
import express, { json, urlencoded, Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import path from 'path'
import { DB_ADDRESS } from './config'
import errorHandler from './middlewares/error-handler'
import serveStatic from './middlewares/serverStatic'
import routes from './routes'

const { PORT = 3000 } = process.env
const app = express()

// 1. Базовые middleware
app.use(cors({
  origin: ['http://localhost', 'http://localhost:5173'],
  credentials: true,
  //allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Authorization']
}));
app.use(helmet());
app.use(cookieParser());


// 2. Парсинг тела запроса ДО CSRF
app.use(urlencoded({ extended: true }))
app.use(json())

// 3. Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts',
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

/*// 4. CSRF protection - ПОСЛЕ парсинга тела и кук
const csrfProtection = csurf({ 
  cookie: true,
  // Исключаем API endpoints из CSRF проверки
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
});

// Применяем CSRF только к определенным routes
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  // Исключаем auth endpoints и CSRF token endpoint из проверки
  if (
    req.path.startsWith('/auth/') ||
    req.path === '/csrf-token' ||
    req.method === 'GET'
  ) {
    return next();
  }
  return csrfProtection(req, res, next);
});

// 5. CSRF token endpoint
app.get('/api/csrf-token', (req: Request, res: Response) => {
  res.json({ csrfToken: req.csrfToken() });
});*/

// 6. Static files
app.use(serveStatic(path.join(__dirname, 'public')))

// 7. Routes
app.use(routes)

// 8. Error handling
app.use(errors())
app.use(errorHandler)

// 9. Bootstrap
const bootstrap = async () => {
    try {
        await mongoose.connect(DB_ADDRESS)
        await app.listen(PORT, () => console.log('Server started on port', PORT))
    } catch (error) {
        console.error(error)
    }
}

bootstrap()