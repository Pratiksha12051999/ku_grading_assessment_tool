import React, { useState, useRef } from 'react';
import './UploadPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';

function UploadPage({ onStartGrading }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [essayData, setEssayData] = useState(null);
  const [parseError, setParseError] = useState(null);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/json" || file.name.endsWith('.json')) {
        setSelectedFile(file);
        parseJsonFile(file);
      } else {
        alert("Please upload a JSON file");
      }
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type === "application/json" || file.name.endsWith('.json')) {
        setSelectedFile(file);
        parseJsonFile(file);
      } else {
        alert("Please upload a JSON file");
      }
    }
  };

  const validateJsonStructure = (data) => {
    // Check for bulk format
    if (data.essays && Array.isArray(data.essays)) {
      for (let i = 0; i < data.essays.length; i++) {
        const essay = data.essays[i];
        if (!essay.student_id) return `Essay ${i + 1}: Missing student_id`;
        if (!essay.content_id) return `Essay ${i + 1}: Missing content_id`;
        if (!essay.essay_response) return `Essay ${i + 1}: Missing essay_response`;
      }
      return null;
    }
    
    // Check for single essay format
    if (data.student_id || data.essay_response) {
      if (!data.student_id) return "Missing student_id";
      if (!data.content_id) return "Missing content_id";
      if (!data.essay_response) return "Missing essay_response";
      return null;
    }
    
    return "Invalid format: Must contain either 'essays' array or single essay with student_id, content_id, and essay_response";
  };

  const parseJsonFile = (file) => {
    setIsUploading(true);
    setUploadProgress(0);
    setUploadComplete(false);
    setParseError(null);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        console.log('Parsed JSON data from uploaded file:', jsonData);
        
        // Validate the structure
        const validationError = validateJsonStructure(jsonData);
        if (validationError) {
          setParseError(validationError);
          setIsUploading(false);
          return;
        }
        
        setEssayData(jsonData);
        simulateUpload();
      } catch (error) {
        setParseError("Invalid JSON file format");
        setIsUploading(false);
        console.error("JSON parse error:", error);
      }
    };
    reader.readAsText(file);
  };

  const simulateUpload = () => {
    setIsUploading(true);
    setUploadProgress(0);
    setUploadComplete(false);
    
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          setUploadComplete(true);
          return 100;
        }
        return prev + 2;
      });
    }, 50);
  };

  const handleChooseNewFile = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setIsUploading(false);
    setUploadComplete(false);
    setEssayData(null);
    setParseError(null);
    fileInputRef.current.value = '';
  };

  const handleStartGrading = () => {
    if (onStartGrading && essayData) {
      onStartGrading(essayData);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      console.log("Uploading file:", selectedFile.name);
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="upload-page">
      <Header />

      <main className="main-content">
        <div className="upload-section">
          <h2 className="upload-title">Upload Essay File</h2>
          <p className="upload-subtitle">Upload JSON file of student essays for automated AI grading</p>

          {!selectedFile ? (
            <div 
              className={`upload-area ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={openFileDialog}
            >
              <div className="upload-icon-container">
                <img src="/upload-icon.svg" alt="Upload" className="upload-icon" />
              </div>
              <h3 className="upload-heading">Upload Your File</h3>
              <p className="upload-text">Drop essay file here or click to browse</p>
              <p className="file-support">Supports JSON (.json) file</p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          ) : (
            <div className="upload-progress-area">
              <svg className="upload-icon" width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="17" x2="12" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="9,12 12,9 15,12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <h3 className="upload-heading">Upload Your File</h3>
              
              <div className="file-info">
                <div className="file-details">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="file-icon">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
                    <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  <span className="file-name">Essay.json</span>
                  <span className="file-size">• 13.5 MB</span>
                </div>
                <span className="progress-percentage">{uploadProgress}%</span>
              </div>
              
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              
              {parseError && (
                <div className="error-message">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/>
                    <line x1="15" y1="9" x2="9" y2="15" stroke="#ef4444" strokeWidth="2"/>
                    <line x1="9" y1="9" x2="15" y2="15" stroke="#ef4444" strokeWidth="2"/>
                  </svg>
                  {parseError}
                </div>
              )}
            </div>
          )}

          {uploadComplete ? (
            <div className="button-group">
              <button 
                className="secondary-button"
                onClick={handleChooseNewFile}
              >
                Choose New File
              </button>
              <button 
                className="upload-button"
                onClick={handleStartGrading}
              >
                Start Grading
              </button>
            </div>
          ) : (
            <button 
              className="upload-button"
              onClick={selectedFile ? handleChooseNewFile : handleUpload}
            >
              {selectedFile ? 'Choose New File' : 'Upload File'}
            </button>
          )}
        </div>

      </main>
      <Footer />
    </div>
  );
}

export default UploadPage;