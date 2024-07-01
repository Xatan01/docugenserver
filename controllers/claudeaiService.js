const Anthropic = require("@anthropic-ai/sdk");
const mammoth = require("mammoth");
const pdfParse = require('pdf-parse');
require('dotenv').config();

console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set');

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
  } else {
    throw new Error(`Unsupported file type: ${file.mimetype}`);
  }
};

const claudeAnalyze = async (files) => {
  try {
    console.log('Extracting text from files...');
    const textContents = await Promise.all(files.map(extractTextFromFile));
    
    console.log('Sending request to Claude API...');
    console.log('API Key:', process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 5) + '...' : 'Not available');
    
    const prompt = `Analyze the following documents and identify common structures and headers. Output a blank template for the user to fill in, formatted as a JSON object. The template should include all major sections and subsections found in the documents. Provide only the JSON object without any additional text or explanation. Here are the document contents:\n\n${textContents.join('\n\n---DOCUMENT SEPARATOR---\n\n')}`;

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

    console.log('Full response from Claude:', JSON.stringify(response, null, 2));
    console.log('Claude\'s response content:', response.content[0].text);

    // Extract JSON from the response
    const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      return JSON.parse(jsonStr);
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