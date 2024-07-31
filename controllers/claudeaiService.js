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
  try {
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
  } catch (error) {
    console.error('Error extracting text from file:', error.message);
    throw new Error(`Failed to extract text from file: ${error.message}`);
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
2. Group related items into objects only (not array) as appropriate.
3. Use descriptive key names that reflect the content they represent.
4. For any repeated items, arrays, or lists, provide ONLY ONE example item. Do not use multiple items or numbering (e.g., item1, item2).
5. For fields that require user input, use placeholder text in square brackets, e.g., "[Enter item description]".
6. Include all relevant sections and subsections found in the input documents.
7. Maintain a logical hierarchy that reflects the structure of procurement documents.
8. Do not repeat any structure or field. If a similar structure appears in multiple places, include it only once in the most appropriate location.
9. For lists of confirmations or similar items, provide a single field with a placeholder text, allowing the user to add multiple entries later.
10. MOST IMPORTANTLY, if multiple documents have the same field, return the same content of the field instead of a placeholder. If multiple documents have the same content with different varying variables in between but are mostly similar, include the same content but allow the user to fill up the varying portion.

Provide only the JSON object without any additional text or explanation. Ensure there are no repetitions in the structure. Here are the document contents:

${textContents.join('\n\n---DOCUMENT SEPARATOR---\n\n')}`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      temperature: 0,
      messages: [{ role: "user", content: prompt }]
    });
    console.log("Claude response: ", response);
    if (!response.content || response.content.length === 0 || !response.content[0].text) {
      throw new Error('Invalid response from Claude API');
    }

    const parsedJson = JSON.parse(response.content[0].text);
    return simplifyStructure(parsedJson);
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
    6. For each section, provide detailed, paragraph-style content instead of brief, list-like entries. For example, instead of "Duration: Onsite warranty of minimum 1 year", provide a full paragraph explaining the warranty terms.
    7. If the user input for any section is insufficient or missing, supplement it with reasonable and relevant information to create a complete and coherent paragraph. The supplemented information should be consistent with typical procurement documents.
    8. Aim to make each section's word count similar to the corresponding sections in the sample documents provided earlier.
    9. For the "Vendor Offer" section and similar sections, provide a comprehensive paragraph explaining the terms and conditions, rather than a brief statement.
    10. Ensure that all content is relevant to the procurement of headphones as specified in the original document.
    
    Please provide the complete generated document content, including all text and table structures. Format the document using markdown syntax for headers and tables.`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }]
    });

    if (!response.content || response.content.length === 0 || !response.content[0].text) {
      throw new Error('Invalid response from Claude API');
    }

    const generatedContent = response.content[0].text;
    return generatedContent;
  } catch (error) {
    console.error('Error calling Claude API:', error);
    throw new Error(`Failed to generate document with Claude API: ${error.message}`);
  }
};

const createPDF = async (content) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 72, right: 72 },
        bufferPages: true
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      doc.info.Title = 'Generated Document';
      doc.info.Author = 'Your Application Name';

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      let currentY = doc.page.margins.top;
      let lastElementType = null;

      const standardLineHeight = 14;
      const paragraphSpacing = standardLineHeight * 1.5;
      const sectionSpacing = standardLineHeight * 2;

      const addContent = (text, options = {}) => {
        const { fontSize = 12, align = 'left', bold = false, underline = false, indent = 0 } = options;

        // Add appropriate spacing based on the last element type
        if (lastElementType === 'header') {
          currentY += standardLineHeight;
        } else if (lastElementType === 'paragraph' || lastElementType === 'list') {
          currentY += paragraphSpacing;
        } else if (lastElementType === 'table') {
          currentY += sectionSpacing;
        }

        doc.fontSize(fontSize);
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');

        const textHeight = doc.heightOfString(text, { 
          width: pageWidth - indent, 
          align: align,
          lineGap: 2
        });

        // Check if the text will fit on the current page
        if (currentY + textHeight > doc.page.height - doc.page.margins.bottom) {
          // If it doesn't fit, add a new page only if we're not at the top of a page
          if (currentY > doc.page.margins.top) {
            doc.addPage();
            currentY = doc.page.margins.top;
          }
        }

        doc.text(text, doc.page.margins.left + indent, currentY, {
          width: pageWidth - indent,
          align: align,
          underline: underline,
          lineGap: 2
        });

        currentY += textHeight;
        lastElementType = 'paragraph';
      };

      const addTable = (tableData) => {
        // Remove markdown formatting and empty cells
        const cleanedData = tableData.map(row => 
          row.filter(cell => cell.trim() !== '|')
             .map(cell => cell.replace(/^[\s|]+|[\s|]+$/g, ''))
        ).filter(row => row.length > 0);

        const headers = cleanedData[0];
        const rows = cleanedData.slice(2); // Skip the separator row
        const cellPadding = 5;
        const fontSize = 10;
        doc.fontSize(fontSize);

        // Calculate column widths based on content
        const columnWidths = headers.map((header, index) => {
          const headerWidth = doc.widthOfString(header) + 2 * cellPadding;
          const maxContentWidth = Math.max(...rows.map(row => doc.widthOfString(row[index]))) + 2 * cellPadding;
          return Math.min(Math.max(headerWidth, maxContentWidth), pageWidth / 2); // Limit to half page width
        });

        // Adjust column widths to fit page width
        const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
        if (tableWidth > pageWidth) {
          const scaleFactor = pageWidth / tableWidth;
          columnWidths.forEach((width, index) => {
            columnWidths[index] = width * scaleFactor;
          });
        }

        // Function to draw a row
        const drawRow = (rowData, isHeader = false) => {
          const rowHeight = Math.max(...rowData.map(cell => 
            doc.heightOfString(cell, { width: Math.min(...columnWidths) - 2 * cellPadding, lineGap: 2 })
          )) + 2 * cellPadding;

          if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            currentY = doc.page.margins.top;
            if (!isHeader) {
              drawRow(headers, true); // Redraw headers on new page
            }
          }

          let startX = doc.page.margins.left;
          rowData.forEach((cell, i) => {
            doc.rect(startX, currentY, columnWidths[i], rowHeight).stroke();
            doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize)
               .text(cell.replace(/<br>/g, '\n'), startX + cellPadding, currentY + cellPadding, {
                 width: columnWidths[i] - 2 * cellPadding,
                 align: isHeader ? 'center' : 'left',
                 valign: 'top',
                 lineGap: 2
               });
            startX += columnWidths[i];
          });
          currentY += rowHeight;
        };

        // Draw headers
        drawRow(headers, true);

        // Draw rows
        rows.forEach(row => drawRow(row));

        lastElementType = 'table';
        currentY += sectionSpacing;
      };

      // Parse and add content
      const lines = content.split('\n');
      let inTable = false;
      let tableData = [];

      lines.forEach((line, index) => {
        if (line.trim().startsWith('|') || line.trim().startsWith('+-')) {
          if (!inTable) {
            inTable = true;
            tableData = [];
          }
          tableData.push(line.split('|').map(cell => cell.trim()).filter(cell => cell));
        } else {
          if (inTable) {
            inTable = false;
            addTable(tableData);
            tableData = [];
          }
          // Handle non-table content
          if (line.startsWith('# ') || line.startsWith('## ') || line.startsWith('### ')) {
            if (index > 0) currentY += sectionSpacing;
            
            if (line.startsWith('# ')) {
              addContent(line.slice(2), { fontSize: 18, align: 'center', bold: true });
            } else if (line.startsWith('## ')) {
              addContent(line.slice(3), { fontSize: 16, bold: true });
            } else if (line.startsWith('### ')) {
              addContent(line.slice(4), { fontSize: 14, bold: true });
            }
            lastElementType = 'header';
          } else if (line.startsWith('- ')) {
            addContent(`• ${line.slice(2)}`, { fontSize: 12, indent: 15 });
            lastElementType = 'list';
          } else if (line.trim() === '') {
            // Skip empty lines, spacing is handled by addContent
          } else {
            addContent(line, { fontSize: 12 });
          }
        }
      });

      // Handle any remaining table data
      if (inTable && tableData.length > 0) {
        addTable(tableData);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { claudeAnalyze, generateDocument, createPDF };
