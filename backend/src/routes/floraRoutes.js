const express = require('express');
const multer = require('multer');
const router = express.Router();
const floraController = require('../controllers/floraController');
const { protect, restrictTo } = require('../middleware/auth');

const csvUpload = multer({ storage: multer.memoryStorage() });

// Main endpoints for Flora Management
router.get('/', protect, restrictTo('staff', 'admin'), floraController.getAllGreenery);       // Fetch plant directory
router.post('/', protect, restrictTo('staff', 'admin'), floraController.createGreenery);      // Create manual record
router.post('/query', protect, restrictTo('staff', 'admin'), floraController.queryHandbook);   // AI natural-language catalog query
router.post('/planting-suggestions', protect, restrictTo('staff', 'admin'), floraController.getPlantingSuggestions); // AI planting suggestions
router.patch('/:id', protect, restrictTo('staff', 'admin'), floraController.updateGreenery);   // Update a record
router.delete('/:id', protect, restrictTo('staff', 'admin'), floraController.softDeleteGreenery); // Soft-delete a record
router.post('/bulk', protect, restrictTo('staff', 'admin'), csvUpload.single('file'), floraController.bulkUploadCSV);   // Bulk import spreadsheet hook
router.post('/:id/care-recommendation', protect, restrictTo('staff', 'admin'), floraController.careRecommendation);   // AI care recommendation

module.exports = router;
