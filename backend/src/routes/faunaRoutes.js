const express = require('express');
const faunaController = require('../controllers/faunaController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// Hotspots must be registered before '/:id' so 'hotspots' is not matched as an id.
router.get('/hotspots', protect, restrictTo('staff', 'admin'), faunaController.getHotspots);
router.get('/hotspots/:block/summary', protect, restrictTo('staff', 'admin'), faunaController.getBlockSummary);

router.get('/', protect, restrictTo('staff', 'admin'), faunaController.listSightings);
router.post('/', protect, restrictTo('staff', 'admin'), faunaController.createSighting);
router.get('/:id', protect, restrictTo('staff', 'admin'), faunaController.getSighting);
router.patch('/:id/status', protect, restrictTo('staff', 'admin'), faunaController.updateStatus);
router.delete('/:id', protect, restrictTo('admin'), faunaController.softDeleteSighting);

module.exports = router;
