import React, { useState } from 'react';
import UploadPage from './pages/UploadPage';
import GradingPage from './pages/GradingPage';
import ResultsPage from './pages/ResultsPage';

function App() {
  const [currentPage, setCurrentPage] = useState('upload');
  const [essayData, setEssayData] = useState(null);
  const [gradingResults, setGradingResults] = useState(null);

  const handleStartGrading = (data) => {
    console.log('Starting grading with data:', data);
    setEssayData(data);
    setCurrentPage('grading');
  };

  const handleViewResults = (results) => {
    setGradingResults(results);
    setCurrentPage('results');
  };

  const handleBackToUpload = () => {
    setCurrentPage('upload');
    setEssayData(null);
    setGradingResults(null);
  };

  if (currentPage === 'grading') {
    return <GradingPage essayData={essayData} onComplete={handleViewResults} />;
  }

  if (currentPage === 'results') {
    return <ResultsPage results={gradingResults} originalEssayData={essayData} onBack={handleBackToUpload} />;
  }

  return <UploadPage onStartGrading={handleStartGrading} />;
}

export default App;