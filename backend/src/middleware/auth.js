const jwt = require('jsonwebtoken');
const { ZoneAssignment } = require('../models');

// Roles that see estate-wide data. Scoping checks test membership of this list
// rather than testing for 'resident', so any role added to the enum later is
// treated as restricted until it is deliberately listed here.
const INTERNAL_ROLES = ['field_officer', 'manager'];

function protect(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function restrictTo(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

// Blocks a Welfare Partner is assigned to cover. Returns null for every other
// role, which callers read as "no zone restriction" (an empty array means the
// partner has been assigned nothing and so sees nothing).
// `user` is the JWT payload set by protect(): { user_id, role, name }.
async function getAssignedBlocks(user) {
  if (user.role !== 'welfare_partner') return null;

  const rows = await ZoneAssignment.findAll({
    where: { user_id: user.user_id },
    attributes: ['block_number'],
  });
  return rows.map(r => r.block_number);
}

module.exports = { protect, restrictTo, getAssignedBlocks, INTERNAL_ROLES };
