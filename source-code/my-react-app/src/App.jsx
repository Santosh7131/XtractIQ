import React, { useRef, useState, useEffect, useMemo } from "react";
import { Upload, FileText, Users, CheckCircle, Database, Sparkles } from "lucide-react";
import { MaterialReactTable, useMaterialReactTable } from "material-react-table";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';

/**
 * Main application component for document processing interface
 * Handles file uploads, data display, and editing functionality
 */
function App() {
    // State management
    const fileInputRef = useRef();
    const [documents, setDocuments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [error, setError] = useState("");
    const [editingCell, setEditingCell] = useState({ row: null, col: null });
    const [editValue, setEditValue] = useState("");
    const [saving, setSaving] = useState(false);
    const [editModal, setEditModal] = useState({ open: false, rowIdx: null, col: null, value: null });

    /**
     * Fetches all documents from the backend
     */
    const fetchDocuments = async () => {
        try {
            setError("");
            const res = await fetch("http://localhost:5000/api/all-documents");
            const data = await res.json();
            setDocuments(data.data || []);
        } catch (err) {
            setError("Failed to fetch documents: " + err.message);
        }
    };

    // Initial data fetch
    useEffect(() => {
        fetchDocuments();
    }, []);

    // File upload handlers
    const handleUploadClick = () => fileInputRef.current.click();

    /**
     * Handles file selection and upload
     * Supports both PDF and image files
     */
    const handleFileChange = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        setUploading(true);
        setFeedback("");
        setError("");

        // Separate files by type
        const pdfFiles = files.filter(file => file.type === "application/pdf");
        const imageFiles = files.filter(file => file.type !== "application/pdf");

        let feedbackMsg = "";
        try {
            // Upload PDFs in batch if any
            if (pdfFiles.length) {
                const formData = new FormData();
                pdfFiles.forEach(file => formData.append("files", file));
                const res = await fetch("http://localhost:5000/api/upload-scanned-pdfs", {
                    method: "POST",
                    body: formData,
                });
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Server error: ${errorText}`);
                }
                const result = await res.json();
                if (result.data) {
                    setDocuments(result.data);
                    feedbackMsg += "PDF documents uploaded and extracted successfully! ";
                } else {
                    setError("PDF upload failed: " + (result.error || "Unknown error"));
                }
            }

            // Upload images in batch if any
            if (imageFiles.length) {
                const formData = new FormData();
                imageFiles.forEach(file => formData.append("files", file));
                const res = await fetch("http://localhost:5000/api/upload-images", {
                    method: "POST",
                    body: formData,
                });
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Server error: ${errorText}`);
                }
                const result = await res.json();
                if (result.data) {
                    setDocuments(result.data);
                    feedbackMsg += "Images uploaded and extracted successfully!";
                } else {
                    setError("Image upload failed: " + (result.error || "Unknown error"));
                }
            }
            setFeedback(feedbackMsg.trim());
        } catch (err) {
            setError("Upload failed: " + err.message);
            console.error("Upload error:", err);
        }
        setUploading(false);
        e.target.value = null;
    };

    /**
     * Component for rendering nested JSON data in a table format
     */
    const SubTable = ({ data }) => {
        // Try to parse stringified JSON
        let parsed = data;
        if (typeof data === 'string') {
            try {
                const tryParsed = JSON.parse(data);
                if (typeof tryParsed === 'object' && tryParsed !== null) {
                    parsed = tryParsed;
                } else {
                    return <span>{String(data)}</span>;
                }
            } catch {
                // Try to fix single quotes to double quotes and parse again
                try {
                    const tryParsed = JSON.parse(data.replace(/'/g, '"'));
                    if (typeof tryParsed === 'object' && tryParsed !== null) {
                        parsed = tryParsed;
                    } else {
                        return <span>{String(data)}</span>;
                    }
                } catch {
                    return <span>{String(data)}</span>;
                }
            }
        }

        if (!parsed || typeof parsed !== 'object') return <span>{String(parsed)}</span>;

        const entries = Array.isArray(parsed)
            ? parsed.map((v, i) => [i, v])
            : Object.entries(parsed);

        return (
            <div style={styles.subTableContainer}>
                <table style={styles.subTable}>
                    <tbody>
                        {entries.map(([key, value]) => (
                            <tr key={key}>
                                <td style={styles.subTableHeader}>{key}</td>
                                <td style={styles.subTableCell}>
                                    {typeof value === 'object' && value !== null
                                        ? <SubTable data={value} />
                                        : typeof value === 'string'
                                            ? <SubTable data={value} />
                                            : String(value)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // Modal handlers
    const handleModalSave = async () => {
        if (editModal.rowIdx === null || !editModal.col) return;
        try {
            const value = JSON.parse(editValue);
            const updatedDocs = [...documents];
            updatedDocs[editModal.rowIdx] = {
                ...updatedDocs[editModal.rowIdx],
                [editModal.col]: value
            };
            setDocuments(updatedDocs);
            setEditModal({ open: false, rowIdx: null, col: null, value: null });
            setEditValue("");
        } catch (err) {
            setError("Invalid JSON format");
        }
    };

    const handleModalCancel = () => {
        setEditModal({ open: false, rowIdx: null, col: null, value: null });
    };

    // Table configuration
    const columns = useMemo(() =>
        documents.length > 0
            ? Object.keys(documents[0]).map((key) => ({
                accessorKey: key,
                header: key,
                enableEditing: true,
                Cell: ({ cell, row }) => {
                    let value = cell.getValue();
                    // Parse JSON strings if possible
                    if (typeof value === 'string' && (value.trim().startsWith('{') || value.trim().startsWith('['))) {
                        try {
                            const parsed = JSON.parse(value);
                            if (typeof parsed === 'object' && parsed !== null) {
                                value = parsed;
                            }
                        } catch {
                            try {
                                const parsed = JSON.parse(value.replace(/'/g, '"'));
                                if (typeof parsed === 'object' && parsed !== null) {
                                    value = parsed;
                                }
                            } catch { }
                        }
                    }

                    if (typeof value === 'object' && value !== null) {
                        return (
                            <div style={styles.cellContainer}>
                                <div style={styles.cellContent}>
                                    <SubTable data={value} />
                                </div>
                                <div style={styles.editButtonContainer}>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={() => setEditModal({
                                            open: true,
                                            rowIdx: row.index,
                                            col: key,
                                            value: value
                                        })}
                                    >
                                        Edit
                                    </Button>
                                </div>
                            </div>
                        );
                    }
                    return <span>{String(value)}</span>;
                },
                // Only allow default editing for primitives
                enableEditing: row => {
                    const value = row.original[key];
                    return typeof value !== 'object';
                }
            }))
            : [],
        [documents]
    );

    // Table editing handlers
    const handleSaveCell = async ({ row, column, value }) => {
        const updatedDocs = [...documents];
        updatedDocs[row.index] = { ...updatedDocs[row.index], [column.id]: value };
        setDocuments(updatedDocs);
    };

    const table = useMaterialReactTable({
        columns,
        data: documents,
        enableEditing: true,
        editDisplayMode: 'cell',
        muiTableContainerProps: { sx: { maxHeight: 500, fontFamily: styles.container.fontFamily } },
        muiTableBodyCellProps: { 
            sx: { 
                fontFamily: styles.container.fontFamily, 
                background: 'white',
                '&:hover': { background: 'white' }, 
                '&.Mui-hover': { background: 'white' } 
            } 
        },
        muiTableHeadCellProps: { sx: { fontFamily: styles.container.fontFamily } },
        muiTableBodyRowProps: { 
            sx: { 
                background: 'white',
                '&:hover': { background: 'white' }, 
                '&.Mui-hover': { background: 'white' } 
            } 
        },
        onEditingCellSave: handleSaveCell,
        state: {
            isLoading: uploading,
        },
    });

    /**
     * Saves verified data to permanent database
     */
    const handleSaveVerified = async () => {
        setSaving(true);
        setFeedback("");
        setError("");
        try {
            const res = await fetch("http://localhost:5000/api/save-verified", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: documents })
            });
            const result = await res.json();
            if (res.ok) {
                setFeedback("Verified data saved to permanent database!");
            } else {
                setError(result.error || "Failed to save verified data");
            }
        } catch (err) {
            setError("Failed to save verified data: " + err.message);
        }
        setSaving(false);
    };

    return (
        <div style={styles.container}>
            <div style={styles.backgroundPattern} />
            <div style={styles.content}>
                {/* Header Section */}
                <header style={styles.header}>
                    <div style={styles.headerIcon}>
                        <div style={styles.iconWrapper}>
                            <Sparkles style={styles.icon} />
                        </div>
                    </div>
                    <h1 style={styles.title}>Document Extractor</h1>
                    <p style={styles.subtitle}>
                        Upload PDFs or images to extract and structure their content using AI
                    </p>
                </header>

                {/* Upload Section */}
                <div style={styles.uploadSection}>
                    <div
                        style={{
                            ...styles.uploadCard,
                            ...(uploading ? styles.uploadCardUploading : {})
                        }}
                        onClick={handleUploadClick}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                            multiple
                            accept="application/pdf,image/*"
                        />
                        <div style={styles.uploadContent}>
                            <div style={styles.uploadIcon}>
                                <Upload style={styles.uploadIconSvg} />
                            </div>
                            <h3 style={styles.uploadTitle}>
                                {uploading ? 'Processing...' : 'Upload Documents'}
                            </h3>
                            <p style={styles.uploadText}>
                                Click to upload PDFs or images
                            </p>
                            <div style={styles.uploadNote}>
                                For best results, use PDF files whenever possible.
                            </div>
                        </div>
                    </div>
                </div>

                {/* Feedback Messages */}
                {feedback && (
                    <div style={styles.feedbackContainer}>
                        <div style={styles.feedbackCard}>
                            <CheckCircle style={styles.feedbackIcon} />
                            <span style={styles.feedbackText}>{feedback}</span>
                        </div>
                    </div>
                )}
                {error && (
                    <div style={{ ...styles.feedbackContainer, color: 'red' }}>
                        <div style={styles.errorCard}>
                            <span style={styles.feedbackText}>{error}</span>
                        </div>
                    </div>
                )}

                {/* Documents Table */}
                <div style={styles.tableContainer}>
                    <div style={styles.tableHeader}>
                        <div style={styles.tableHeaderContent}>
                            <div style={styles.tableHeaderIcon}>
                                <Database style={styles.tableHeaderIconSvg} />
                            </div>
                            <div>
                                <h2 style={styles.tableTitle}>Extracted Documents</h2>
                                <p style={styles.tableSubtitle}>
                                    All processed documents and their extracted data
                                </p>
                            </div>
                        </div>
                    </div>
                    <div style={styles.tableWrapper}>
                        <MaterialReactTable table={table} />
                    </div>
                </div>

                {/* Edit Modal */}
                <Dialog
                    open={editModal.open}
                    onClose={handleModalCancel}
                    maxWidth="md"
                    fullWidth
                >
                    <DialogTitle>Edit {editModal.col}</DialogTitle>
                    <DialogContent>
                        <TextField
                            multiline
                            rows={10}
                            fullWidth
                            value={editValue || JSON.stringify(editModal.value, null, 2)}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="Enter JSON data"
                            variant="outlined"
                            margin="normal"
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleModalCancel}>Cancel</Button>
                        <Button onClick={handleModalSave} variant="contained" color="primary">
                            Save
                        </Button>
                    </DialogActions>
                </Dialog>
            </div>
        </div>
    );
}

// Styles
const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e0f2fe 50%, #e8eaf6 100%)',
        position: 'relative',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    },
    backgroundPattern: {
        position: 'absolute',
        inset: 0,
        backgroundImage: 'linear-gradient(rgba(0,0,0,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.02) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
        zIndex: 1
    },
    content: {
        position: 'relative',
        zIndex: 10,
        maxWidth: '75vw',
        width: '75vw',
        margin: '0 auto',
        padding: '2rem 2rem'
    },
    header: {
        textAlign: 'center',
        marginBottom: '3rem'
    },
    headerIcon: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: '1.5rem',
        position: 'relative'
    },
    iconWrapper: {
        width: '64px',
        height: '64px',
        background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
        borderRadius: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 10px 25px rgba(37, 99, 235, 0.3)'
    },
    icon: {
        width: '32px',
        height: '32px',
        color: 'white'
    },
    title: {
        fontSize: '3rem',
        fontWeight: 'bold',
        background: 'linear-gradient(135deg, #2563eb, #4f46e5, #7c3aed)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: '1rem',
        lineHeight: 1.2
    },
    subtitle: {
        fontSize: '1.25rem',
        color: '#64748b',
        maxWidth: '600px',
        margin: '0 auto',
        lineHeight: 1.6
    },
    uploadSection: {
        marginBottom: '3rem'
    },
    uploadCard: {
        position: 'relative',
        backgroundColor: 'white',
        borderRadius: '24px',
        border: '2px dashed #cbd5e1',
        cursor: 'pointer',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.3s ease',
        ':hover': {
            borderColor: '#3b82f6',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
        }
    },
    uploadCardUploading: {
        borderColor: '#3b82f6',
        backgroundColor: '#eff6ff'
    },
    uploadContent: {
        padding: '3rem',
        textAlign: 'center'
    },
    uploadIcon: {
        width: '48px',
        height: '48px',
        margin: '0 auto 1.5rem',
        color: '#3b82f6'
    },
    uploadIconSvg: {
        width: '100%',
        height: '100%'
    },
    uploadTitle: {
        fontSize: '1.5rem',
        fontWeight: 'bold',
        color: '#1e293b',
        marginBottom: '0.5rem'
    },
    uploadText: {
        fontSize: '1rem',
        color: '#64748b',
        marginBottom: '1rem'
    },
    uploadNote: {
        marginTop: '1rem',
        color: '#64748b',
        fontSize: '0.95rem',
        textAlign: 'center'
    },
    feedbackContainer: {
        marginBottom: '2rem'
    },
    feedbackCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '1rem',
        backgroundColor: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: '0.5rem',
        color: '#166534'
    },
    errorCard: {
        backgroundColor: '#fee2e2',
        border: '1px solid #fecaca',
        borderRadius: '0.5rem',
        color: '#991b1b',
        padding: '1rem'
    },
    feedbackIcon: {
        width: '20px',
        height: '20px'
    },
    feedbackText: {
        fontSize: '0.95rem',
        lineHeight: 1.5
    },
    tableContainer: {
        backgroundColor: 'white',
        borderRadius: '24px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
    },
    tableHeader: {
        padding: '1.5rem 2rem',
        borderBottom: '1px solid #e2e8f0'
    },
    tableHeaderContent: {
        display: 'flex',
        alignItems: 'center',
        gap: '1rem'
    },
    tableHeaderIcon: {
        width: '40px',
        height: '40px',
        backgroundColor: '#f1f5f9',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    tableHeaderIconSvg: {
        width: '24px',
        height: '24px',
        color: '#475569'
    },
    tableTitle: {
        fontSize: '1.25rem',
        fontWeight: 'bold',
        color: '#1e293b',
        margin: 0
    },
    tableSubtitle: {
        fontSize: '0.95rem',
        color: '#64748b',
        margin: '0.25rem 0 0'
    },
    tableWrapper: {
        padding: '1.5rem'
    },
    tableCell: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: 'white',
        '&:hover': { backgroundColor: 'white' },
        '&.Mui-hover': { backgroundColor: 'white' }
    },
    tableRow: {
        backgroundColor: 'white',
        '&:hover': { backgroundColor: 'white' },
        '&.Mui-hover': { backgroundColor: 'white' }
    },
    cellContainer: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 80
    },
    cellContent: {
        flex: 1,
        width: '100%'
    },
    editButtonContainer: {
        display: 'flex',
        justifyContent: 'center',
        marginTop: 12,
        marginBottom: 2
    },
    subTableContainer: {
        background: '#f8fafc',
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        padding: 8,
        margin: 0,
        width: '100%',
        minWidth: 0,
        minHeight: 60,
        boxSizing: 'border-box',
        display: 'block'
    },
    subTable: {
        fontSize: '0.98em',
        borderCollapse: 'collapse',
        width: '100%'
    },
    subTableHeader: {
        border: '1px solid #e2e8f0',
        padding: '6px 10px',
        fontWeight: 600,
        background: '#f1f5f9',
        color: '#334155',
        minWidth: 90
    },
    subTableCell: {
        border: '1px solid #e2e8f0',
        padding: '6px 10px',
        background: '#fff'
    }
};

export default App;