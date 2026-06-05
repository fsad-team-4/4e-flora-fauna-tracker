const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const yup = require('yup');
const { User } = require('../models');

const registerSchema = yup.object({
  name: yup.string().required().min(2),
  email: yup.string().required().email(),
  password: yup.string().required().min(6),
  role: yup.string().oneOf(['resident', 'staff', 'admin']).default('resident'),
});

const loginSchema = yup.object({
  email: yup.string().required(),
  password: yup.string().required(),
});

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

  const token = jwt.sign(
    { user_id: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.status(200).json({ token });
}

module.exports = { register, login };
