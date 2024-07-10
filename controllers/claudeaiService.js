// src/services/claudeaiService.js
const Anthropic = require("@anthropic-ai/sdk");
const mammoth = require("mammoth");
const pdfParse = require('pdf-parse');
const WordExtractor = require("word-extractor");
require('dotenv').config();

console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const extractTextFromFile = async (file) => {
  console.log(`Attempting to extract text from file with mimetype: ${file.mimetype}`);
  const buffer = file.buffer;
  if (file.mimetype === 'application/pdf') {
    console.log('Processing PDF file');
    const data = await pdfParse(buffer);
    return data.text;
  } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    console.log('Processing DOCX file');
    const result = await mammoth.extractRawText({ buffer }, {
      convertImage: mammoth.images.imgElement(function(image) {
        return { src: image.read("base64").then(function(imageBuffer) {
          return "data:" + image.contentType + ";base64," + imageBuffer;
        }) };
      }),
      transformDocument: mammoth.transforms.paragraph(transformParagraph)
    });
    return result.value;
  } else if (file.mimetype === 'application/msword') {
    console.log('Processing DOC file');
    const extractor = new WordExtractor();
    const extracted = await extractor.extract(buffer);
    return extracted.getBody();
  } else {
    console.error(`Unsupported file type: ${file.mimetype}`);
    throw new Error(`Unsupported file type: ${file.mimetype}`);
  }
};

const transformParagraph = (paragraph) => {
  // Check if the paragraph contains a table
  if (paragraph.children[0] && paragraph.children[0].type === 'table') {
    return transformTable(paragraph.children[0]);
  }
  return paragraph;
};

const transformTable = (table) => {
  // Transform table elements to a more structured format
  return {
    type: 'table',
    children: table.children.map(row => ({
      type: 'table-row',
      children: row.children.map(cell => ({
        type: 'table-cell',
        children: cell.children.map(child => ({
          type: child.type,
          value: child.value
        }))
      }))
    }))
  };
};

const simplifyStructure = (obj) => {
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'string') {
      // For arrays of strings (like confirmations), return a single string placeholder
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
    console.log('Extracting text from files...');
    const textContents = await Promise.all(files.map(extractTextFromFile));
    
    console.log('Sending request to Claude API...');
    console.log('API Key:', process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 5) + '...' : 'Not available');
    
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

Provide only the JSON object without any additional text or explanation. Ensure there are no repetitions in the structure. Here are the document contents:

${textContents.join('\n\n---DOCUMENT SEPARATOR---\n\n')}`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

    console.log('Full response from Claude:', JSON.stringify(response, null, 2));

    // Extract JSON from the response
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

const claudeGenerate = async (structure, userInputs) => {
  const prompt = `Generate a full document based on the following structure and user inputs. Structure: ${JSON.stringify(structure)}. User Inputs: ${JSON.stringify(userInputs)}. The generated document should maintain a professional tone and formatting consistent with the original structure.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 4000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Error calling Claude API:', error.message);
    throw new Error(`Failed to generate document with Claude API: ${error.message}`);
  }
};

module.exports = { claudeAnalyze, claudeGenerate };