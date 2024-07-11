// controllers/applicationService.js
const { claudeAnalyze, generateDocument, createPDF } = require('./claudeaiService');

const analyzeDocuments = async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const analysisResult = await claudeAnalyze(files);
    res.status(200).json(analysisResult);
  } catch (error) {
    console.error('Error in analyzeDocuments:', error);
    res.status(500).json({ message: 'Error analyzing documents', error: error.message });
  }
};

const generateDocumentPDF = async (req, res) => {
  try {
    const { structure, userInputs } = req.body;
    
    if (!structure || !userInputs) {
      return res.status(400).json({ message: 'Structure or user inputs missing' });
    }

    const generatedContent = await generateDocument(structure, userInputs);
    const pdfBuffer = await createPDF(generatedContent);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="generated_document.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error in generateDocumentPDF:', error);
    res.status(500).json({ message: 'Error generating document', error: error.message });
  }
};

module.exports = { analyzeDocuments, generateDocumentPDF };