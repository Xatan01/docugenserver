const express = require('express');
const multer = require('multer');
const path = require('path');
const { analyzeDocuments, generateDocument } = require('../controllers/applicationService');

const router = express.Router();

// Initialize multer for file upload
const upload = multer({ 
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // limit file size to 5MB
});

function fileFilter(req, file, cb) {
  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only docx and PDFs are allowed"), false);
  }
}

// Define the route for the document analysis API
router.post('/analyze', upload.array('files'), analyzeDocuments);

// Define the route for the document generation API
router.post('/generate', generateDocument);

module.exports = router;
