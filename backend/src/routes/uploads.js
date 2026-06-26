const express = require('express');
const multer = require('multer');
const uploadController = require('../controllers/uploadController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'Image must be 5MB or smaller',
  LIMIT_UNEXPECTED_FILE: "Image must be sent in a field named 'image'",
};

// Run multer and turn its rejections into clear 400s. Cloudinary errors come
// later in the controller and still flow to the global 500 handler.
function handleUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: MULTER_MESSAGES[err.code] || 'Image upload failed' });
    }
    // fileFilter rejection (plain Error) - use its message
    return res.status(400).json({ error: err.message });
  });
}

router.post('/', protect, handleUpload, uploadController.uploadImage);

module.exports = router;
