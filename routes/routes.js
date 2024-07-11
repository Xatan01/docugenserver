const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { analyzeDocuments, generateDocumentPDF } = require('./controllers/applicationService');

const app = express();

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Configure multer for file upload
const upload = multer({ 
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
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
  },
  limits: { fileSize: 5 * 1024 * 1024 } // limit file size to 5MB
});

// Define routes
app.post('/analyze', upload.array('files'), analyzeDocuments);
app.post('/generate', generateDocumentPDF);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});