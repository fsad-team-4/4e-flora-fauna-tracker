const express = require('express');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);

// Own-profile routes: any authenticated role, always scoped to the caller's own
// record via req.user.user_id - never an id taken from the body or params.
router.get('/me', protect, authController.me);
router.patch('/me', protect, authController.updateMe);
router.post('/change-password', protect, authController.changePassword);

module.exports = router;
