// src/openaiService.js
const fs = require('fs');
const path = require('path');
const { Configuration, OpenAIApi } = require('openai');
const FormData = require('form-data');
const axios = require('axios');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const uploadFileToOpenAI = async (file) => {
  const form = new FormData();
  form.append('file', fs.createReadStream(file.path), file.originalname);
  form.append('purpose', 'answers');

  const response = await axios.post('https://api.openai.com/v1/files', form, {
    headers: {
      ...form.getHeaders(),
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  });

  return response.data;
};

const extractFieldsWithOpenAI = async (files) => {
  const uploadedFiles = await Promise.all(files.map(file => uploadFileToOpenAI(file)));
  const fileIds = uploadedFiles.map(file => file.id);

  const prompt = `Extract the following fields from the documents:

  - **Invoice Date:** (DD/MM/YY format)
  - **Invoice Number:**
  - **Total Amount:** (Include currency symbol if present)
  - **Classification:** (Strictly "Medical", "Dental", or "Non-Medical")

  Documents:`;

  const messages = [
    { role: "system", content: "You are a helpful assistant designed to output JSON." },
    { role: "user", content: prompt },
    ...fileIds.map(id => ({ role: "user", content: { file: id } })),
  ];

  const response = await openai.createChatCompletion({
    model: "gpt-4",
    messages: messages,
    max_tokens: 500,
    temperature: 0,
  });

  let result = response.data.choices[0].message.content.trim();

  // Use regex to remove markdown markers
  result = result.replace(/```json\n?|```/g, '').trim();

  try {
    const parsedResult = JSON.parse(result);
    return parsedResult;
  } catch (e) {
    console.error("Failed to parse JSON:", result);
    throw new Error("OpenAI response was not valid JSON");
  }
};

module.exports = { extractFieldsWithOpenAI };
