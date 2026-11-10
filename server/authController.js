const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function getAuthRepository(req) {
  return req.app && req.app.locals ? req.app.locals.authRepository : null;
}

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body ?? {};

    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'name, email, and password are required',
      });
    }

    const authRepository = getAuthRepository(req);

    if (!authRepository || typeof authRepository.createUser !== 'function') {
      return res.status(501).json({
        message: 'Auth persistence layer is not configured yet.',
      });
    }

    const passwordHash = await hashPassword(password);
    const user = await authRepository.createUser({
      name,
      email,
      passwordHash,
    });

    return res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({
        message: 'email and password are required',
      });
    }

    const authRepository = getAuthRepository(req);

    if (!authRepository || typeof authRepository.findUserByEmail !== 'function') {
      return res.status(501).json({
        message: 'Auth persistence layer is not configured yet.',
      });
    }

    const user = await authRepository.findUserByEmail(email);

    if (!user || !user.password_hash) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const passwordMatches = await comparePassword(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    return res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  SALT_ROUNDS,
  hashPassword,
  comparePassword,
  register,
  login,
};