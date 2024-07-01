// src/routes/routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { analyzeDocuments, generateDocument } = require('../controllers/applicationService');

// Initialize multer for file upload
const upload = multer({ 
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // limit file size to 5MB
});

function fileFilter(req, file, cb) {
  const filetypes = /pdf|docx/;
  const mimetype = filetypes.test(file.mimetype);
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only docx and PDFs are allowed"));
  }
}

// Define the route for the document analysis API
router.post('/analyze', upload.array('files'), analyzeDocuments);

// Define the route for the document generation API
router.post('/generate', generateDocument);

module.exports = router;