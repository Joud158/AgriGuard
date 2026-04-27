const { readDb } = require('../data/store');
const { verifyAccessToken } = require('../utils/tokens');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  try {
    const payload = verifyAccessToken(token);
    const db = await readDb();
    const user = db.users.find((entry) => entry.id === payload.sub && entry.is_active);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token.',
      });
    }

    req.auth = {
      id: user.id,
      role: user.role,
      email: user.email,
      clubId: user.club_id || null,
    };

    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    });
  }
}

module.exports = authenticate;
