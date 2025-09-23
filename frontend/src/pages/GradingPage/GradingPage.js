import React, { useState, useEffect } from 'react';
import './GradingPage.css';
import Header from '../../components/Header/Header';

function GradingPage({ essayData, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);

  const [isGrading, setIsGrading] = useState(false);
  const [error, setError] = useState(null);

  const steps = [
    {
      id: 1,
      title: "Analyzing Essay Content",
      description: "Extracting text and detecting essay type"
    },
    {
      id: 2,
      title: "Evaluating Against Rubric",
      description: "Scoring essays based on the rubric"
    },
    {
      id: 3,
      title: "Generating Feedback & Insights",
      description: "Composing feedback & insights for each essay"
    },
    {
      id: 4,
      title: "Flagging Sensitive Content",
      description: "Scanning for self-harm or concerning language"
    },
    {
      id: 5,
      title: "Finalizing Grading Results",
      description: "Assigning confidence scores and preparing results"
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // API call function
  const gradeEssays = async () => {
    if (!essayData || isGrading) return;
    
    setIsGrading(true);
    setError(null);
    
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL;
      const apiUrl = `${API_BASE_URL}/grade-essay`;

      console.log('Using API URL from env:', apiUrl);
      
      let requestBody;
      
      // Check if it's bulk grading (has essays array)
      if (essayData.essays && Array.isArray(essayData.essays)) {
        // Bulk grading format
        requestBody = {
          batch_id: essayData.batch_id || `batch_${Date.now()}`,
          store_in_s3: essayData.store_in_s3 !== undefined ? essayData.store_in_s3 : true,
          essays: essayData.essays.map(essay => ({
            student_id: essay.student_id || `student_${Date.now()}`,
            content_id: essay.content_id || "1",
            essay_type: essay.essay_type || "Source Dependent Responses",
            essay_response: essay.essay_response || ""
          }))
        };
      } else if (essayData.student_id || essayData.essay_response) {
        // Single essay format
        requestBody = {
          student_id: essayData.student_id || `student_${Date.now()}`,
          content_id: essayData.content_id || "1",
          essay_type: essayData.essay_type || "Source Dependent Responses",
          essay_response: essayData.essay_response || ""
        };
      } else {
        throw new Error('Invalid file format: Missing required essay data (student_id, content_id, essay_response)');
      }

      console.log('Sending request to API:', {
        url: apiUrl,
        method: 'POST',
        body: requestBody
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      console.log('API Response Status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const results = await response.json();
      console.log('API Response Data:', results);
      
      // Complete the grading process - go directly to results
      setTimeout(() => {
        onComplete(results);
      }, 1000);
      
    } catch (err) {
      console.error('Grading error:', err);
      setError(err.message);
      setIsGrading(false);
    }
  };

  // Start grading process when component mounts
  useEffect(() => {
    if (essayData && !isGrading) {
      gradeEssays();
    }
  }, [essayData]);

  // Simulate progress steps during API call
  useEffect(() => {
    if (!isGrading) return;
    
    const stepTimer = setInterval(() => {
      setCurrentStep(prev => {
        if (prev < steps.length - 1) {
          return prev + 1;
        } else {
          clearInterval(stepTimer);
          return prev;
        }
      });
    }, 2000);

    return () => clearInterval(stepTimer);
  }, [isGrading, steps.length]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')} minutes`;
  };

  if (error) {
    return (
      <div className="grading-page">
        <Header />

        <main className="main-content">
          <div className="error-section">
            <div className="error-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/>
                <line x1="15" y1="9" x2="9" y2="15" stroke="#ef4444" strokeWidth="2"/>
                <line x1="9" y1="9" x2="15" y2="15" stroke="#ef4444" strokeWidth="2"/>
              </svg>
            </div>
            <h2>Grading Failed</h2>
            <p>There was an error processing your essays: {error}</p>
            <button className="retry-button" onClick={() => window.location.reload()}>
              Try Again
            </button>
          </div>
        </main>
      </div>
    );
  }



  return (
    <div className="grading-page">
      <Header />

      <main className="main-content">
        <div className="grading-section">
          <div className="grading-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#0051BA" strokeWidth="2"/>
              <polyline points="14,2 14,8 20,8" stroke="#0051BA" strokeWidth="2"/>
              <path d="m9 15 2 2 4-4" stroke="#0051BA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          
          <h2 className="grading-title">Grading Your Essay</h2>
          
          <div className="time-info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#475569" strokeWidth="2"/>
              <polyline points="12,6 12,12 16,14" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Time Elapsed: {formatTime(timeElapsed)}</span>
          </div>
          
          <p className="grading-subtitle">
            The grading process may take a few minutes depending on the 
            number and complexity of essays submitted.
          </p>

          <div className="progress-bar-container">
            <div className="progress-bar-grading">
              <div 
                className="progress-fill-grading" 
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="steps-container">
            {steps.map((step, index) => (
              <div 
                key={step.id} 
                className={`step ${index <= currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              >
                <div className="step-number">
                  {index < currentStep ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <polyline points="20,6 9,17 4,12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    step.id
                  )}
                </div>
                <div className="step-content">
                  <h3 className="step-title">{step.title}</h3>
                  <p className="step-description">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default GradingPage;