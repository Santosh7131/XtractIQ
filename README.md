# XTRACTIQ

This project is a full-stack application for uploading scanned PDFs and images, extracting text using OCR (Azure), and structuring the extracted data using AI (Groq). The backend is built with Node.js/Express and Python, and the frontend is a React app powered by Vite.

## Features
- Upload scanned PDFs and images
- Extract text using Azure OCR
- Structure and classify extracted data using Groq AI
- View and verify structured data in a modern React UI
- Save verified data to a PostgreSQL database

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- Python 3.8+
- PostgreSQL

### Project Structure 
XtractIQ/
├── backend/              # Node.js + Python API
│   ├── extractor/        # AI + OCR logic
│   ├── routes/           # Express route handlers
│   └── insert_to_pg.py   # DB insertion logic
├── my-react-app/         # React frontend
└── uploads/              # Uploaded files (temporary)


### Backend Setup
1. Install dependencies:
   ```sh
   cd backend
   npm install
   ```
2. Open the relevant backend source files (such as `extractor/aiApiCall.js`, `routes/uploadroutes.js`, and `insert_to_pg.py`).
3. Directly update the following values in the code:
   - Azure endpoint and API key
   - Groq API key
   - Database host, user, password, and name
   - Any other endpoints or credentials as needed
4. Start the backend server:
   ```
   node server.js
   ```

### Frontend Setup
1. Install dependencies:
   ```
   cd my-react-app
   npm install
   ```
2. Start the frontend:
   ```
   npm run dev
   ```

### Development Notes
- The frontend expects the backend to run on `http://localhost:5000` by default.
- Update proxy settings in `vite.config.js` or API URLs in the code if your backend runs elsewhere.



