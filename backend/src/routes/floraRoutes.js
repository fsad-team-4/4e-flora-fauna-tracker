const express = require('express');
const multer = require('multer');
const router = express.Router();
const floraController = require('../controllers/floraController');
const { protect, restrictTo } = require('../middleware/auth');

const csvUpload = multer({ storage: multer.memoryStorage() });

// Main endpoints for Flora Management
router.get('/', protect, restrictTo('field_officer', 'manager'), floraController.getAllGreenery);       // Fetch plant directory
router.post('/', protect, restrictTo('field_officer', 'manager'), floraController.createGreenery);      // Create manual record
router.post('/query', protect, restrictTo('field_officer', 'manager'), floraController.queryHandbook);   // AI natural-language catalog query
router.patch('/:id', protect, restrictTo('field_officer', 'manager'), floraController.updateGreenery);   // Update a record
router.delete('/:id', protect, restrictTo('field_officer', 'manager'), floraController.softDeleteGreenery); // Soft-delete a record
router.post('/bulk', protect, restrictTo('field_officer', 'manager'), csvUpload.single('file'), floraController.bulkUploadCSV);   // Bulk import spreadsheet hook
router.post('/:id/care-recommendation', protect, restrictTo('field_officer', 'manager'), floraController.careRecommendation);   // AI care recommendation

module.exports = router;
