/**
 * Test files and data for content extraction testing
 */

export const TEST_FILES = {
  // Simple text file
  TEXT_FILE: {
    id: 'test-text-file',
    name: 'test-document.txt',
    mimeType: 'text/plain',
    content: `This is a test document for content extraction.

It contains multiple paragraphs with different types of content.

Here are some bullet points:
• First point with important information
• Second point with additional details
• Third point with conclusion

And here's a numbered list:
1. First numbered item
2. Second numbered item
3. Third numbered item

The document also contains some special characters: àáâãäåæçèéêë

And some numbers: 123, 456.789, $1,234.56

Finally, it ends with this paragraph that should be chunked appropriately based on the token limits.`
  },

  // JSON file
  JSON_FILE: {
    id: 'test-json-file',
    name: 'test-data.json',
    mimeType: 'application/json',
    content: JSON.stringify({
      title: 'Test JSON Document',
      description: 'This is a test JSON file for content extraction testing',
      data: {
        users: [
          { id: 1, name: 'John Doe', email: 'john@example.com' },
          { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
        ],
        settings: {
          theme: 'dark',
          language: 'en',
          notifications: true
        }
      },
      metadata: {
        version: '1.0.0',
        created: '2025-01-01T00:00:00Z',
        updated: '2025-01-02T12:00:00Z'
      }
    }, null, 2)
  },

  // CSV file
  CSV_FILE: {
    id: 'test-csv-file',
    name: 'test-data.csv',
    mimeType: 'text/csv',
    content: `Name,Email,Age,Department,Salary
John Doe,john@example.com,30,Engineering,75000
Jane Smith,jane@example.com,28,Marketing,65000
Bob Johnson,bob@example.com,35,Sales,70000
Alice Brown,alice@example.com,32,HR,60000
Charlie Wilson,charlie@example.com,29,Engineering,72000`
  },

  // HTML file
  HTML_FILE: {
    id: 'test-html-file',
    name: 'test-page.html',
    mimeType: 'text/html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test HTML Document</title>
</head>
<body>
    <header>
        <h1>Test HTML Document</h1>
        <nav>
            <ul>
                <li><a href="#section1">Section 1</a></li>
                <li><a href="#section2">Section 2</a></li>
            </ul>
        </nav>
    </header>
    
    <main>
        <section id="section1">
            <h2>First Section</h2>
            <p>This is the first section of the test HTML document. It contains some <strong>bold text</strong> and <em>italic text</em>.</p>
            <ul>
                <li>First list item</li>
                <li>Second list item</li>
                <li>Third list item</li>
            </ul>
        </section>
        
        <section id="section2">
            <h2>Second Section</h2>
            <p>This is the second section with a table:</p>
            <table>
                <thead>
                    <tr>
                        <th>Column 1</th>
                        <th>Column 2</th>
                        <th>Column 3</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Row 1, Col 1</td>
                        <td>Row 1, Col 2</td>
                        <td>Row 1, Col 3</td>
                    </tr>
                    <tr>
                        <td>Row 2, Col 1</td>
                        <td>Row 2, Col 2</td>
                        <td>Row 2, Col 3</td>
                    </tr>
                </tbody>
            </table>
        </section>
    </main>
    
    <footer>
        <p>&copy; 2025 Test Document. All rights reserved.</p>
    </footer>
</body>
</html>`
  },

  // Markdown file
  MARKDOWN_FILE: {
    id: 'test-markdown-file',
    name: 'test-readme.md',
    mimeType: 'text/markdown',
    content: `# Test Markdown Document

This is a test markdown document for content extraction testing.

## Features

- **Bold text** and *italic text*
- [Links](https://example.com)
- \`Inline code\` and code blocks:

\`\`\`javascript
function testFunction() {
    console.log('Hello, world!');
    return true;
}
\`\`\`

## Lists

### Unordered List
- Item 1
- Item 2
  - Nested item 2.1
  - Nested item 2.2
- Item 3

### Ordered List
1. First item
2. Second item
3. Third item

## Table

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |
| Value 4  | Value 5  | Value 6  |

## Blockquote

> This is a blockquote with some important information
> that spans multiple lines.

## Conclusion

This markdown document contains various elements that should be properly extracted and chunked.`
  }
};

export const MOCK_DRIVE_FILES = [
  {
    id: 'google-doc-1',
    name: 'Test Google Document',
    owners: [{ emailAddress: 'test@example.com' }],
    mimeType: 'application/vnd.google-apps.document',
    size: '15000',
    modifiedTime: '2025-01-01T10:00:00.000Z',
    createdTime: '2025-01-01T09:00:00.000Z',
    permissions: [],
    webViewLink: 'https://docs.google.com/document/d/google-doc-1/edit',
    thumbnailLink: 'https://example.com/thumb1.jpg',
    parents: ['parent-folder-1']
  },
  {
    id: 'pdf-file-1',
    name: 'Test PDF Document.pdf',
    owners: [{ emailAddress: 'test@example.com' }],
    mimeType: 'application/pdf',
    size: '250000',
    modifiedTime: '2025-01-01T11:00:00.000Z',
    createdTime: '2025-01-01T10:00:00.000Z',
    permissions: [],
    webViewLink: 'https://drive.google.com/file/d/pdf-file-1/view',
    thumbnailLink: 'https://example.com/thumb2.jpg',
    parents: ['parent-folder-1']
  },
  {
    id: 'docx-file-1',
    name: 'Test Word Document.docx',
    owners: [{ emailAddress: 'test@example.com' }],
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: '45000',
    modifiedTime: '2025-01-01T12:00:00.000Z',
    createdTime: '2025-01-01T11:00:00.000Z',
    permissions: [],
    webViewLink: 'https://drive.google.com/file/d/docx-file-1/view',
    thumbnailLink: 'https://example.com/thumb3.jpg',
    parents: ['parent-folder-1']
  },
  {
    id: 'xlsx-file-1',
    name: 'Test Excel Spreadsheet.xlsx',
    owners: [{ emailAddress: 'test@example.com' }],
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: '32000',
    modifiedTime: '2025-01-01T13:00:00.000Z',
    createdTime: '2025-01-01T12:00:00.000Z',
    permissions: [],
    webViewLink: 'https://drive.google.com/file/d/xlsx-file-1/view',
    thumbnailLink: 'https://example.com/thumb4.jpg',
    parents: ['parent-folder-1']
  }
];

export const EXPECTED_CHUNKS = {
  TEXT_FILE: [
    'This is a test document for content extraction.\n\nIt contains multiple paragraphs with different types of content.',
    'Here are some bullet points:\n• First point with important information\n• Second point with additional details\n• Third point with conclusion',
    'And here\'s a numbered list:\n1. First numbered item\n2. Second numbered item\n3. Third numbered item',
    'The document also contains some special characters: àáâãäåæçèéêë\n\nAnd some numbers: 123, 456.789, $1,234.56',
    'Finally, it ends with this paragraph that should be chunked appropriately based on the token limits.'
  ]
};

export const createMockFileBuffer = (content: string): Buffer => {
  return Buffer.from(content, 'utf-8');
};

export const createMockPDFBuffer = (): Buffer => {
  // Create minimal PDF buffer for testing
  const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF content) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
300
%%EOF`;
  
  return Buffer.from(pdfContent, 'utf-8');
};
