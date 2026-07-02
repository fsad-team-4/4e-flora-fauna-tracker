const express = require('express');
const multer = require('multer');
const router = express.Router();
const floraController = require('../controllers/floraController');
const { protect, restrictTo } = require('../middleware/auth');

const csvUpload = multer({ storage: multer.memoryStorage() });

// Main endpoints for Flora Management
router.get('/', protect, floraController.getAllGreenery);       // Fetch plant directory
router.post('/', protect, restrictTo('staff', 'admin'), floraController.createGreenery);      // Create manual record
router.patch('/:id', protect, restrictTo('staff', 'admin'), floraController.updateGreenery);   // Update a record
router.delete('/:id', protect, restrictTo('staff', 'admin'), floraController.softDeleteGreenery); // Soft-delete a record
router.post('/bulk', protect, restrictTo('staff', 'admin'), csvUpload.single('file'), floraController.bulkUploadCSV);   // Bulk import spreadsheet hook

module.exports = router;
