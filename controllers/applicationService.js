// src/applicationService.js
const { openaiGen } = require('./openaiService');

const analyzeDocuments = async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const analysisResult = await openaiGen(files);
    res.status(200).json(analysisResult);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error analyzing documents', error: error.message });
  }
};

module.exports = {
  analyzeDocuments,
};
