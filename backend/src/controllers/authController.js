const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const yup = require('yup');
const { User } = require('../models');

const registerSchema = yup.object({
  name: yup.string().required().min(2),
  email: yup.string().required().email(),
  password: yup.string().required().min(6),
  role: yup.string().oneOf(['resident', 'staff', 'admin', 'manager', 'field_officer', 'welfare_partner']).default('resident'),});

const loginSchema = yup.object({
  email: yup.string().required(),
  password: yup.string().required(),
});

// Profile edits: both fields optional, but at least one must be present so an
// empty PATCH is a 400 rather than a silent no-op.
const updateMeSchema = yup.object({
  name: yup.string().min(2),
  email: yup.string().email(),
}).test(
  'at-least-one',
  'Provide a name or an email to update',
  v => Boolean(v && (v.name !== undefined || v.email !== undefined))
);

const changePasswordSchema = yup.object({
  current_password: yup.string().required(),
  new_password: yup.string().required().min(6),
});

// The single place the login/profile token is minted, so its payload shape
// ({ user_id, role, name }) can't drift between login and a profile rename.
function signToken(user) {
  return jwt.sign(
    { user_id: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Public shape of a user - never leaks password_hash.
function publicUser(user) {
  return {
    user_id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

async function register(req, res) {
  let data;
  try {
    data = await registerSchema.validate(req.body, { abortEarly: false });
  } catch (err) {
    return res.status(400).json({ error: err.errors });
  }

  try {
    const password_hash = await bcrypt.hash(data.password, 10);
    const user = await User.create({
      name: data.name,
      email: data.email,
      password_hash,
      role: data.role,
    });

    return res.status(201).json({
      user_id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Email already registered' });
    }
    throw err;
  }
}

async function login(req, res) {
  let data;
  try {
    data = await loginSchema.validate(req.body, { abortEarly: false });
  } catch (err) {
    return res.status(400).json({ error: err.errors });
  }

  const user = await User.findOne({ where: { email: data.email } });
  if (!user || !(await bcrypt.compare(data.password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  return res.status(200).json({ token: signToken(user) });
}

// GET /me - the profile page's source of truth. The JWT only carries
// { user_id, role, name }, so email and join date have to come from the row.
async function me(req, res) {
  const user = await User.findByPk(req.user.user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.status(200).json(publicUser(user));
}

// PATCH /me - update own name and/or email.
// Returns a FRESH token: `name` is embedded in the JWT, so without re-issuing it
// the nav bar would keep showing the old name until the session expired.
async function updateMe(req, res) {
  let data;
  try {
    data = await updateMeSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  } catch (err) {
    return res.status(400).json({ error: err.errors });
  }

  const user = await User.findByPk(req.user.user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Role is deliberately not updatable here - self-service privilege escalation.
  if (data.name !== undefined) user.name = data.name;
  if (data.email !== undefined) user.email = data.email;

  try {
    await user.save();
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Email already registered' });
    }
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({ error: err.errors.map(e => e.message) });
    }
    throw err;
  }

  return res.status(200).json({ ...publicUser(user), token: signToken(user) });
}

// POST /change-password - requires the current password, so a stolen token alone
// cannot lock the real owner out.
async function changePassword(req, res) {
  let data;
  try {
    data = await changePasswordSchema.validate(req.body, { abortEarly: false });
  } catch (err) {
    return res.status(400).json({ error: err.errors });
  }

  const user = await User.findByPk(req.user.user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (!(await bcrypt.compare(data.current_password, user.password_hash))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (data.current_password === data.new_password) {
    return res.status(400).json({ error: 'New password must differ from the current one' });
  }

  user.password_hash = await bcrypt.hash(data.new_password, 10);
  await user.save();

  // NOTE: existing tokens stay valid until they expire - there is no token
  // blacklist in this build, so a password change does not end other sessions.
  return res.status(200).json({ message: 'Password updated' });
}

module.exports = { register, login, me, updateMe, changePassword };
