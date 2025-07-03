const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { extractTextFromImage, extractTextFromScannedPDF } = require('../extractor/aiApiCall');
const { spawn } = require('child_process');
const { Pool } = require('pg');
const { PDFDocument } = require('pdf-lib');

/**
 * Express router setup with multer for file uploads
 * Only allows PDF and image files
 */
const router = express.Router();
const upload = multer({ 
    dest: path.join(__dirname, '..', 'uploads'),
    fileFilter: (req, file, cb) => {
        if (
            file.mimetype === 'application/pdf' ||
            file.mimetype.startsWith('image/')
        ) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF and image files are allowed.'));
        }
    }
});

/**
 * Database connection pools
 * TODO: Move credentials to environment variables
 */
const dbPool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'your_database_name',
    user: 'postgres',
    password: 'your_password_here'
});

const afterVerifyPool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'your_after_verify_db',
    user: 'postgres',
    password: 'your_password_here'
});

/**
 * Helper function to insert data into PostgreSQL using Python script
 * @param {Object|Array} data - Data to insert
 * @returns {Promise<void>}
 */
async function insertToPostgres(data) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '..', 'insert_to_pg.py');
        const py = spawn(
            'python3',
            [scriptPath]
        );
        let stderr = '';
        py.stdin.write(JSON.stringify(Array.isArray(data) ? data : [data]));
        py.stdin.end();
        py.stderr.on('data', (d) => { stderr += d.toString(); });
        py.on('close', (code) => {
            if (code === 0) resolve();
            else reject(stderr || 'Insert script failed');
        });
    });
}

/**
 * Helper function to check if an object is flat (no nested objects/arrays)
 * @param {Object} obj - Object to check
 * @returns {boolean}
 */
function isFlatObject(obj) {
    return Object.values(obj).every(val => 
        typeof val !== 'object' || val === null
    );
}

/**
 * Helper function to flatten object for database storage
 * @param {Object} obj - Object to flatten
 * @returns {Object} Flattened object
 */
function flattenForDb(obj) {
    const flattened = {};
    for (const [key, value] of Object.entries(obj)) {
        flattened[key] = typeof value === 'object' && value !== null
            ? JSON.stringify(value)
            : value;
    }
    return flattened;
}

/**
 * Route to handle single image upload
 * Extracts text using OCR and structures it using AI
 */
router.post('/upload-image', upload.single('file'), async (req, res) => {
    console.log('--- [UPLOAD] /upload-image called ---');
    try {
        // Validate file type
        if (!req.file.mimetype.startsWith('image/')) {
            console.log('Rejected: Not an image file');
            return res.status(400).json({ error: 'Only image files are allowed for this endpoint.' });
        }

        console.log('File received:', req.file.path);
        const text = await extractTextFromImage(req.file.path);
        console.log('OCR+AI result:', text);

        // Clean up uploaded file
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        // Handle AI processing errors
        if (text.error) {
            console.log('AI error:', text.error, text.structured_data || '');
            return res.status(500).json({ error: text.error, details: text.structured_data || '' });
        }

        // Validate AI output structure
        if (!isFlatObject(text)) {
            console.log('AI did not return flat object:', text);
            return res.status(500).json({ error: 'AI did not return a flat JSON object', details: text });
        }

        // Store in database
        console.log('Inserting to DB:', text);
        await insertToPostgres(flattenForDb(text));
        const result = await dbPool.query('SELECT * FROM documents;');
        console.log('DB query result:', result.rows);
        res.json({ data: result.rows });
    } catch (error) {
        console.error('Image Processing Error:', error.stack || error);
        res.status(500).json({ 
            error: 'Image processing failed', 
            details: error.message || 'Internal server error' 
        });
    }
});

/**
 * Route to handle PDF upload
 * Converts PDF to images, extracts text using OCR, and structures it using AI
 */
router.post('/upload-scanned-pdf', upload.single('file'), async (req, res) => {
    console.log('--- [UPLOAD] /upload-scanned-pdf called ---');
    try {
        // Validate file upload
        if (!req.file) {
            console.log('Rejected: No file uploaded');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Validate file type
        if (req.file.mimetype !== 'application/pdf') {
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            console.log('Rejected: Not a PDF file');
            return res.status(400).json({ error: 'Invalid file type. Only PDF files are allowed.' });
        }

        console.log('File received:', req.file.path);
        const text = await extractTextFromScannedPDF(req.file.path);
        console.log('OCR+AI result:', text);

        // Clean up uploaded file
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        // Handle AI processing errors
        if (text.error) {
            console.log('AI error:', text.error, text.structured_data || '');
            return res.status(500).json({ error: text.error, details: text.structured_data || '' });
        }

        // Validate AI output structure
        if (!isFlatObject(text)) {
            console.log('AI did not return flat object:', text);
            return res.status(500).json({ error: 'AI did not return a flat JSON object', details: text });
        }

        // Store in database
        console.log('Inserting to DB:', text);
        await insertToPostgres(flattenForDb(text));
        const result = await dbPool.query('SELECT * FROM documents;');
        console.log('DB query result:', result.rows);
        res.json({ data: result.rows });
    } catch (error) {
        console.error('PDF Processing Error:', error.stack || error);
        res.status(500).json({ 
            error: 'PDF processing failed', 
            details: error.message || 'Internal server error' 
        });
    }
});

/**
 * Route to handle multiple image uploads
 * Processes each image in sequence and returns combined results
 */
router.post('/upload-images', upload.array('files'), async (req, res) => {
    console.log('--- [UPLOAD] /upload-images called ---');
    try {
        // Validate file upload
        if (!req.files || req.files.length === 0) {
            console.log('Rejected: No files uploaded');
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const results = [];
        const toInsert = [];

        // Process each file
        for (const file of req.files) {
            try {
                if (!file.mimetype.startsWith('image/')) {
                    results.push({ filename: file.originalname, error: 'Only image files are allowed for this endpoint.' });
                    console.log('Rejected file (not image):', file.originalname);
                    continue;
                }

                console.log('File received:', file.path);
                const text = await extractTextFromImage(file.path);
                console.log('OCR+AI result:', text);

                // Clean up uploaded file
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

                if (text.error) {
                    results.push({ filename: file.originalname, error: text.error });
                    console.log('AI error:', text.error);
                } else {
                    results.push({ filename: file.originalname, extractedText: text });
                    toInsert.push(flattenForDb(text));
                }
            } catch (err) {
                results.push({ filename: file.originalname, error: err.message });
                console.log('Error processing file:', file.originalname, err.stack || err);
            }
        }

        // Store successful results in database
        if (toInsert.length > 0) {
            try {
                console.log('Inserting to DB:', toInsert);
                await insertToPostgres(toInsert);
            } catch (err) {
                console.error('DB Insert Error (batch image):', err.stack || err);
            }
        }

        const result = await dbPool.query('SELECT * FROM documents;');
        console.log('DB query result:', result.rows);
        res.json({ data: result.rows });
    } catch (error) {
        console.error('Batch image processing failed:', error.stack || error);
        res.status(500).json({ error: 'Batch image processing failed', details: error.message });
    }
});

/**
 * Route to handle multiple PDF uploads
 * Processes each PDF in sequence and returns combined results
 */
router.post('/upload-scanned-pdfs', upload.array('files'), async (req, res) => {
    console.log('--- [UPLOAD] /upload-scanned-pdfs called ---');
    try {
        if (!req.files || req.files.length === 0) {
            console.log('Rejected: No files uploaded');
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const results = [];
        const toInsert = [];

        // Process each file
        for (const file of req.files) {
            if (file.mimetype !== 'application/pdf') {
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
                results.push({ filename: file.originalname, error: 'Invalid file type. Only PDF files are allowed.' });
                console.log('Rejected file (not PDF):', file.originalname);
                continue;
            }

            try {
                console.log('File received:', file.path);
                const text = await extractTextFromScannedPDF(file.path);
                console.log('OCR+AI result:', text);

                // Clean up uploaded file
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

                if (text.error) {
                    results.push({ filename: file.originalname, error: text.error });
                    console.log('AI error:', text.error);
                } else {
                    results.push({ filename: file.originalname, extractedText: text });
                    toInsert.push(flattenForDb(text));
                }
            } catch (err) {
                results.push({ filename: file.originalname, error: err.message });
                console.log('Error processing file:', file.originalname, err.stack || err);
            }
        }

        // Store successful results in database
        if (toInsert.length > 0) {
            try {
                console.log('Inserting to DB:', toInsert);
                await insertToPostgres(toInsert);
            } catch (err) {
                console.error('DB Insert Error (batch pdf):', err.stack || err);
            }
        }

        const result = await dbPool.query('SELECT * FROM documents;');
        console.log('DB query result:', result.rows);
        res.json({ data: result.rows });
    } catch (error) {
        console.error('Batch PDF processing failed:', error.stack || error);
        res.status(500).json({ error: 'Batch PDF processing failed', details: error.message });
    }
});

/**
 * Route to fetch all documents from the database
 */
router.get('/all-documents', async (req, res) => {
    try {
        const result = await dbPool.query('SELECT * FROM documents;');
        res.json({ data: result.rows });
    } catch (err) {
        console.error('Error fetching documents:', err);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// Helper to ensure columns exist in the after_verify DB
afterVerifyPool.ensureColumns = async function(table, requiredColumns) {
  const cur = await afterVerifyPool.connect();
  try {
    const res = await cur.query(`SELECT column_name FROM information_schema.columns WHERE table_name='${table}';`);
    const existing = new Set(res.rows.map(row => row.column_name));
    for (const col of requiredColumns) {
      if (!existing.has(col)) {
        await cur.query(`ALTER TABLE ${table} ADD COLUMN "${col}" TEXT;`);
      }
    }
  } finally {
    cur.release();
  }
};

// Helper to create table if not exists in after_verify DB
afterVerifyPool.createTableIfNotExists = async function(table, columns) {
  const colDefs = columns.map(k => `"${k}" TEXT`).join(', ');
  await afterVerifyPool.query(`CREATE TABLE IF NOT EXISTS ${table} (${colDefs});`);
};

// POST /api/save-verified
router.post('/save-verified', async (req, res) => {
  try {
    const data = req.body.data;
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'No data provided' });
    }
    const allKeys = Array.from(new Set(data.flatMap(obj => Object.keys(obj))));
    const table = 'documents';
    await afterVerifyPool.createTableIfNotExists(table, allKeys);
    await afterVerifyPool.ensureColumns(table, allKeys);
    for (const row of data) {
      await afterVerifyPool.ensureColumns(table, Object.keys(row));
      const keys = Object.keys(row);
      const values = keys.map(k => row[k]);
      const colStr = keys.map(k => `"${k}"`).join(', ');
      const valStr = keys.map((_, i) => `$${i + 1}`).join(', ');
      await afterVerifyPool.query(`INSERT INTO ${table} (${colStr}) VALUES (${valStr});`, values);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving verified data:', err);
    res.status(500).json({ error: 'Failed to save verified data' });
  }
});

module.exports = router;
