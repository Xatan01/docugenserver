// src/applicationService.js
const express = require('express');
const multer = require('multer');
const openaiService = require('./openaiService');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());

app.post('/analyze', upload.array('files'), async (req, res) => {
  try {
    const files = req.files;
    const results = await openaiService.extractFieldsWithOpenAI(files);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
