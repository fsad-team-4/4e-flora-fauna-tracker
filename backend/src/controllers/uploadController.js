const cloudinary = require('../config/cloudinary');

async function uploadImage(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: '4e-reports' },
        (err, uploaded) => (err ? reject(err) : resolve(uploaded))
      );
      stream.end(req.file.buffer);
    });

    return res.status(200).json({ url: result.secure_url });
  } catch (err) {
    return next(err);
  }
}

module.exports = { uploadImage };
