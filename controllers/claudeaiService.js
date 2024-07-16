const Anthropic = require("@anthropic-ai/sdk");
const mammoth = require("mammoth");
const pdfParse = require('pdf-parse');
const WordExtractor = require("word-extractor");
const PDFDocument = require('pdfkit');
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const extractTextFromFile = async (file) => {
  const buffer = file.buffer;
  if (file.mimetype === 'application/pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } else if (file.mimetype === 'application/msword') {
    const extractor = new WordExtractor();
    const extracted = await extractor.extract(buffer);
    return extracted.getBody();
  } else {
    throw new Error(`Unsupported file type: ${file.mimetype}`);
  }
};

const simplifyStructure = (obj) => {
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'string') {
      return "[Enter item]";
    }
    return [simplifyStructure(obj[0])];
  } else if (typeof obj === 'object' && obj !== null) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = simplifyStructure(value);
    }
    return result;
  }
  return obj;
};

const claudeAnalyze = async (files) => {
  try {
    const textContents = await Promise.all(files.map(extractTextFromFile));
    
    const prompt = `Analyze the following documents and create a comprehensive, structured template that captures all major sections, subsections, and key elements EXPLICITLY PRESENT in the documents. The template will be filled up with content by the user to generate a new document similar to the sample documents.

Output the template as a nested JSON object. Follow these guidelines strictly:
1. Use camelCase for all keys.
2. Group related items into objects or arrays as appropriate.
3. Use descriptive key names that reflect the content they represent.
4. For any repeated items, arrays, or lists, provide ONLY ONE example item. Do not use multiple items or numbering (e.g., item1, item2).
5. For fields that require user input, use placeholder text in square brackets, e.g., "[Enter item description]".
6. Include all relevant sections and subsections found in the input documents.
7. Maintain a logical hierarchy that reflects the structure of procurement documents.
8. Do not repeat any structure or field. If a similar structure appears in multiple places, include it only once in the most appropriate location.
9. For lists of confirmations or similar items, provide a single field with a placeholder text, allowing the user to add multiple entries later.
10. MOST IMPORTANTLY, if multiple documents have the samne filed, return the same content of the field instead of a placeholder.

Provide only the JSON object without any additional text or explanation. Ensure there are no repetitions in the structure. Here are the document contents:

${textContents.join('\n\n---DOCUMENT SEPARATOR---\n\n')}`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      temperature: 0,
      messages: [{ role: "user", content: prompt }]
    });

    const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      const parsedJson = JSON.parse(jsonStr);
      return simplifyStructure(parsedJson);
    } else {
      throw new Error('No valid JSON found in Claude\'s response');
    }
  } catch (error) {
    console.error('Error calling Claude API:', error.message);
    throw new Error(`Failed to analyze documents with Claude API: ${error.message}`);
  }
};

const generateDocument = async (structure, userInputs) => {
  try {
    const prompt = `Generate a full document based on the following structure and user inputs. 
    Structure: ${JSON.stringify(structure)}
    User Inputs: ${JSON.stringify(userInputs)}
    
    Instructions:
    1. Use the provided structure as a template for the document.
    2. Fill in the content using the user inputs.
    3. Maintain a professional tone throughout the document.
    4. Ensure proper formatting and organization based on the original structure.
    5. Include tables where appropriate, based on the original structure.
    6. If any required information is missing from the user inputs, use placeholder text or reasonable assumptions.
    
    Please provide the complete generated document content, including all text and table structures.`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }]
    });
    console.log('claude response: ', response);

    const generatedContent = response.content[0].text;
    return generatedContent;
  } catch (error) {
    console.error('Error calling Claude API:', error);
    throw new Error(`Failed to generate document with Claude API: ${error.message}`);
  }
};

const createPDF = async (content) => {
  console.log("Generating PDF with content:", content);  // Log the content to see what is being written to the PDF.
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });
    doc.on('error', (error) => {
      reject(error);  
    });
    doc.text(content); 
    doc.end();
  });
};



module.exports = { claudeAnalyze, generateDocument, createPDF };
