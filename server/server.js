const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('tsx/cjs/api').register();
const { register, login } = require('./authController');
const dashboardRouter = require('./src/routes/dashboard.ts');
const invoicesRouter = require('./src/routes/invoices');
const filesRouter = require('./src/routes/files.ts');
const settingsRouter = require('./src/routes/settings.ts');

const app = express();

const PORT = process.env.PORT || 3000;
const APP_TOKEN = process.env.APP_TOKEN;
const ALLOWED_ORIGIN = process.env.APP_ORIGIN || 'tauri://localhost';
const publicDir = path.resolve(__dirname, '..', 'public');
const rootIndexFile = path.resolve(__dirname, '..', 'index.html');

if (!APP_TOKEN) {
  throw new Error('APP_TOKEN environment variable is required');
}

app.disable('x-powered-by');

app.use(helmet());
app.use(helmet.hidePoweredBy());
app.use(helmet.frameguard({ action: 'deny' }));
app.use(helmet.xssFilter());
app.use(helmet.noSniff());
app.use(helmet.ieNoOpen());
app.use(
  helmet.hsts({
    maxAge: 90 * 24 * 60 * 60,
    includeSubDomains: true,
    preload: false,
  }),
);
app.use(helmet.dnsPrefetchControl({ allow: false }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use(
  helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'trusted-cdn.com'],
    },
  }),
);

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});

const authRouter = express.Router();
authRouter.post('/register', register);
authRouter.post('/login', login);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

function originCheck(req, res, next) {
  const origin = req.get('origin');

  if (!origin || origin === ALLOWED_ORIGIN) {
    return next();
  }

  return res.status(403).json({ message: 'Origin not allowed' });
}

function bearerTokenAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme === 'Bearer' && token === APP_TOKEN) {
    return next();
  }

  return res.status(401).json({ message: 'Unauthorized' });
}

app.use('/api', apiLimiter, originCheck, bearerTokenAuth, authRouter, dashboardRouter, invoicesRouter, filesRouter, settingsRouter);

app.use(express.static(publicDir, { fallthrough: true }));

app.get('/', (req, res) => {
  res.sendFile(rootIndexFile);
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({
    message: 'Internal server error',
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server listening on http://127.0.0.1:${PORT}`);
});