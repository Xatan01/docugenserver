// src/controllers/applicationService.js
const { claudeAnalyze, claudeGenerate } = require('./claudeaiService');

const analyzeDocuments = async (req, res) => {
  try {
    const files = req.files;
    if (!files.length) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const analysisResult = await claudeAnalyze(files);
    res.status(200).json(analysisResult);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error analyzing documents', error: error.message });
  }
};

const generateDocument = async (req, res) => {
  try {
    const { structure, userInputs } = req.body;
    if (!structure || !userInputs) {
      return res.status(400).json({ message: 'Structure or user inputs missing' });
    }

    const document = await claudeGenerate(structure, userInputs);
    res.status(200).json(document);
    } catch (error) {
    console.error(error);
      res.status(500).json({ message: 'Error generating document', error: error.message });
}
};

module.exports = { analyzeDocuments, generateDocument };


