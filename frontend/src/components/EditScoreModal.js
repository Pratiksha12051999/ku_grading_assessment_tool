import React, { useState, useEffect } from 'react';
import './EditScoreModal.css';

function EditScoreModal({ isOpen, onClose, currentScore, maxScore, onSave, studentId, currentFeedback, currentGeneralFeedback }) {
  const [expandedSections, setExpandedSections] = useState({
    content_understanding: true,
    question_addressing: false,
    use_of_textual_evidence: false,
    analysis_and_interpretation: false,
    writing_quality: false,
    overall_performance: false
  });

  const [scores, setScores] = useState({
    content_understanding: Math.floor(maxScore / 2),
    question_addressing: Math.floor(maxScore / 2),
    use_of_textual_evidence: Math.floor(maxScore / 2),
    analysis_and_interpretation: Math.floor(maxScore / 2),
    writing_quality: Math.floor(maxScore / 2),
    overall_performance: Math.floor(maxScore / 2)
  });

  const [feedback, setFeedback] = useState('The essay demonstrates a basic understanding of the text and provides a reasonable explanation for why the author concludes with this paragraph. However, the analysis does not fully explore the deeper complexities or thematic significance, which would be required for a score of 3.');
  const [originalAIFeedback, setOriginalAIFeedback] = useState('');

  const [gradingSource, setGradingSource] = useState({
    content_understanding: 'ai',
    question_addressing: 'ai',
    use_of_textual_evidence: 'ai',
    analysis_and_interpretation: 'ai',
    writing_quality: 'ai',
    overall_performance: 'ai'
  });

  // Generate detailed descriptions for each rubric category
  const generateContentUnderstandingDescriptions = (maxScore) => {
    const descriptions = {};
    for (let i = 0; i <= maxScore; i++) {
      if (i === 0) {
        descriptions[i] = 'The response is completely irrelevant, incorrect, or consists of only copied text from the question. It demonstrates no understanding of the text or the task. Alternatively, no response is provided.';
      } else if (i === maxScore) {
        descriptions[i] = 'The response demonstrates a sophisticated understanding of the text\'s complexities, particularly how the concluding paragraph encapsulates the story\'s themes of adaptation, resilience, and renewal. The response insightfully explains why the author chose this specific ending and how it connects to the broader narrative.';
      } else {
        const percentage = i / maxScore;
        if (percentage >= 0.8) {
          descriptions[i] = 'The response demonstrates a strong understanding of the text and provides a well-developed explanation for why the author concludes with this paragraph. Shows good grasp of key elements and themes.';
        } else if (percentage >= 0.5) {
          descriptions[i] = 'The response demonstrates a basic or literal understanding of the text and provides a reasonable explanation for why the author concludes with this paragraph, though the analysis may not fully explore the deeper complexities or thematic significance.';
        } else {
          descriptions[i] = 'The response shows evidence of minimal understanding of the text and provides a simplistic or underdeveloped explanation for why the author concludes with this paragraph. The response may be brief, vague, or show misunderstanding of key elements.';
        }
      }
    }
    return descriptions;
  };

  const generateQuestionAddressingDescriptions = (maxScore) => {
    const descriptions = {};
    for (let i = 0; i <= maxScore; i++) {
      if (i === 0) {
        descriptions[i] = 'Does not address the question or provides completely irrelevant information.';
      } else if (i === maxScore) {
        descriptions[i] = 'Thoroughly addresses the question with comprehensive explanation of the author\'s choice. Demonstrates complete focus on the specific question asked.';
      } else {
        const percentage = i / maxScore;
        if (percentage >= 0.8) {
          descriptions[i] = 'Clearly addresses the question with a well-focused explanation of why the author concludes with this paragraph. Shows strong attention to the specific question.';
        } else if (percentage >= 0.5) {
          descriptions[i] = 'Adequately addresses the question, explaining why the author concludes with this paragraph. Generally stays on topic.';
        } else {
          descriptions[i] = 'Minimally addresses the question with limited focus on why the author concludes with this paragraph. May drift from the main question.';
        }
      }
    }
    return descriptions;
  };

  const generateTextualEvidenceDescriptions = (maxScore) => {
    const descriptions = {};
    for (let i = 0; i <= maxScore; i++) {
      if (i === 0) {
        descriptions[i] = 'No textual evidence provided or evidence is completely irrelevant to supporting the explanation.';
      } else if (i === maxScore) {
        descriptions[i] = 'Strong, relevant textual evidence that effectively supports all claims and demonstrates thorough engagement with the text. Evidence is well-integrated and clearly connected to the analysis.';
      } else {
        const percentage = i / maxScore;
        if (percentage >= 0.8) {
          descriptions[i] = 'Good use of textual evidence that supports most claims. Evidence is relevant and generally well-integrated into the response.';
        } else if (percentage >= 0.5) {
          descriptions[i] = 'Adequate textual evidence that supports the main points, though may lack specificity or depth. Evidence is present but may not be fully developed.';
        } else {
          descriptions[i] = 'Minimal textual evidence that may not directly support the explanation or is used ineffectively. Evidence may be vague or poorly connected to the analysis.';
        }
      }
    }
    return descriptions;
  };

  const generateAnalysisDescriptions = (maxScore) => {
    const descriptions = {};
    for (let i = 0; i <= maxScore; i++) {
      if (i === 0) {
        descriptions[i] = 'No analysis provided, only summary or copying from the text.';
      } else if (i === maxScore) {
        descriptions[i] = 'Sophisticated analysis with deep interpretation, insight, and connections that demonstrate complex understanding. Goes beyond surface-level observations to explore deeper meanings.';
      } else {
        const percentage = i / maxScore;
        if (percentage >= 0.8) {
          descriptions[i] = 'Strong analysis with good interpretation and insight. Shows understanding beyond simple summary and makes meaningful connections.';
        } else if (percentage >= 0.5) {
          descriptions[i] = 'Adequate analysis showing understanding beyond simple summary, with reasonable interpretation of the text. Some analytical thinking is evident.';
        } else {
          descriptions[i] = 'Minimal analysis with basic interpretation that shows limited insight into the text\'s meaning. Mostly summary with little analytical depth.';
        }
      }
    }
    return descriptions;
  };

  const generateWritingQualityDescriptions = (maxScore) => {
    const descriptions = {};
    for (let i = 0; i <= maxScore; i++) {
      if (i === 0) {
        descriptions[i] = 'Writing is unclear, disorganized, with significant errors that impede understanding.';
      } else if (i === maxScore) {
        descriptions[i] = 'Writing is clear, well-organized, and effectively communicates ideas with minimal errors. Demonstrates strong command of language and structure.';
      } else {
        const percentage = i / maxScore;
        if (percentage >= 0.8) {
          descriptions[i] = 'Writing is clear and well-organized with good communication of ideas. Minor errors do not interfere with understanding.';
        } else if (percentage >= 0.5) {
          descriptions[i] = 'Writing is generally clear and organized with minor errors that do not significantly impact understanding. Ideas are communicated adequately.';
        } else {
          descriptions[i] = 'Writing has some organization but may be unclear in places with errors that occasionally interfere with meaning. Communication of ideas is somewhat limited.';
        }
      }
    }
    return descriptions;
  };

  const generateOverallPerformanceDescriptions = (maxScore) => {
    const descriptions = {};
    for (let i = 0; i <= maxScore; i++) {
      if (i === 0) {
        descriptions[i] = 'The response demonstrates no understanding of the task or text.';
      } else if (i === maxScore) {
        descriptions[i] = 'The response demonstrates comprehensive understanding and sophisticated analysis. Exceeds expectations in all areas.';
      } else {
        const percentage = i / maxScore;
        if (percentage >= 0.8) {
          descriptions[i] = 'The response demonstrates strong understanding with good analysis. Meets or exceeds expectations in most areas.';
        } else if (percentage >= 0.5) {
          descriptions[i] = 'The response demonstrates adequate understanding with some limitations. Meets basic expectations.';
        } else {
          descriptions[i] = 'The response shows minimal understanding with significant gaps. Below expectations in several areas.';
        }
      }
    }
    return descriptions;
  };

  const rubricSections = {
    content_understanding: {
      title: 'Content Understanding',
      descriptions: generateContentUnderstandingDescriptions(maxScore)
    },
    question_addressing: {
      title: 'Question Addressing',
      descriptions: generateQuestionAddressingDescriptions(maxScore)
    },
    use_of_textual_evidence: {
      title: 'Textual Evidence',
      descriptions: generateTextualEvidenceDescriptions(maxScore)
    },
    analysis_and_interpretation: {
      title: 'Analysis & Interpretation',
      descriptions: generateAnalysisDescriptions(maxScore)
    },
    writing_quality: {
      title: 'Writing Quality',
      descriptions: generateWritingQualityDescriptions(maxScore)
    },
    overall_performance: {
      title: 'Overall Performance',
      descriptions: generateOverallPerformanceDescriptions(maxScore)
    }
  };

  useEffect(() => {
    if (isOpen && currentFeedback) {
      // Initialize with actual scores from API feedback
      const initialScores = {};
      const initialGradingSource = {};

      // Extract scores from feedback object
      Object.entries(currentFeedback).forEach(([key, feedback]) => {
        if (feedback.score) {
          const scoreValue = parseInt(feedback.score.split('/')[0]);
          // Only use the parsed value if it's a valid number (including 0)
          initialScores[key] = isNaN(scoreValue) ? 2 : scoreValue;
          // Check if this feedback item has a manual override
          initialGradingSource[key] = feedback.isManualOverride === true ? 'human' : 'ai';
        }
      });

      // Set default scores if no feedback available
      const defaultScore = Math.floor(maxScore / 2);
      const defaultScores = {
        content_understanding: defaultScore,
        question_addressing: defaultScore,
        use_of_textual_evidence: defaultScore,
        analysis_and_interpretation: defaultScore,
        writing_quality: defaultScore,
        overall_performance: defaultScore
      };

      setScores({ ...defaultScores, ...initialScores });

      // Reset grading source to AI for all sections
      setGradingSource({
        content_understanding: 'ai',
        question_addressing: 'ai',
        use_of_textual_evidence: 'ai',
        analysis_and_interpretation: 'ai',
        writing_quality: 'ai',
        overall_performance: 'ai',
        ...initialGradingSource
      });

      // Use saved general feedback if available, otherwise use default AI feedback
      const defaultAIFeedback = 'The essay demonstrates a basic understanding of the text and provides a reasonable explanation for why the author concludes with this paragraph. However, the analysis does not fully explore the deeper complexities or thematic significance, which would be required for a score of 3.';
      const originalFeedback = currentGeneralFeedback || defaultAIFeedback;

      setOriginalAIFeedback(originalFeedback);
      setFeedback(currentGeneralFeedback || ''); // If there's custom feedback, use it, otherwise start with empty for manual input
    }
  }, [isOpen, currentFeedback, currentGeneralFeedback]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleScoreChange = (section, score) => {
    setScores(prev => ({
      ...prev,
      [section]: score
    }));

    // Mark as human graded when user changes score
    setGradingSource(prev => ({
      ...prev,
      [section]: 'human'
    }));
  };

  const handleSave = () => {
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
    const numSections = Object.keys(scores).length;
    const meanScore = totalScore / numSections; // Calculate mean instead of sum
    const maxPossibleScore = maxScore; // Use the actual max score

    // Check if any scores were manually overridden
    const hasManualOverrides = Object.values(gradingSource).some(source => source === 'human');

    // Create updated feedback object with manual override indicators
    // Start with all existing feedback to preserve everything
    const updatedFeedback = { ...currentFeedback };

    // Only update the sections that have scores in the modal
    Object.entries(scores).forEach(([section, score]) => {
      const isManualOverride = gradingSource[section] === 'human';

      // Only update if this section exists or if it's been manually overridden
      if (updatedFeedback[section] || isManualOverride) {
        const existingFeedback = updatedFeedback[section] ?
          updatedFeedback[section].text :
          (currentFeedback && currentFeedback[section] ? currentFeedback[section].text : '');

        updatedFeedback[section] = {
          ...(updatedFeedback[section] || {}), // Keep any existing properties
          score: `${score}/${maxScore}`,
          grade: isManualOverride ? 'Human Graded' : 'AI Graded',
          text: existingFeedback,
          isManualOverride: isManualOverride
        };
      }
    });

    onSave({
      score: `${Math.round(meanScore)}/${maxPossibleScore}`,
      meanScore: Math.round(meanScore),
      scores: scores,
      gradingSource: gradingSource,
      feedback: updatedFeedback,
      generalFeedback: feedback,
      hasManualOverrides: hasManualOverrides,
      studentId
    });
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const getScoreColor = (score) => {
    switch (score) {
      case 3: return '#22c55e';
      case 2: return '#3b82f6';
      case 1: return '#f59e0b';
      case 0: return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getScoreLabel = (score) => {
    if (score === 0) return 'Inadequate Response';
    if (score === maxScore) return 'Exemplary Response';
    
    // For scores in between, create dynamic labels
    const percentage = score / maxScore;
    if (percentage >= 0.8) return 'Good Response';
    if (percentage >= 0.5) return 'Adequate Response';
    return 'Minimal Response';
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Score</h2>
          <button className="close-button" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" />
              <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {Object.entries(rubricSections).map(([key, section]) => (
            <div key={key} className="rubric-section">
              <div
                className="section-header"
                onClick={() => toggleSection(key)}
              >
                <h3>{section.title}</h3>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className={`chevron ${expandedSections[key] ? 'expanded' : ''}`}
                >
                  <polyline points="6,9 12,15 18,9" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>

              {expandedSections[key] && (
                <div className="section-content">
                  <div className="score-options">
                    {Array.from({ length: maxScore + 1 }, (_, i) => i).map((score) => {
                      const isSelected = scores[key] === score;
                      const isAIGraded = gradingSource[key] === 'ai';
                      const isHumanGraded = gradingSource[key] === 'human';

                      return (
                        <div key={score} className={`score-option ${isSelected ? (isAIGraded ? 'ai-selected' : 'human-selected') : ''}`}>
                          <div className="score-header">
                            <label className="score-radio">
                              <input
                                type="radio"
                                name={key}
                                value={score}
                                checked={isSelected}
                                onChange={() => handleScoreChange(key, score)}
                              />
                              <span className={`radio-button ${isSelected ? 'selected' : ''} ${isSelected && gradingSource[key] === 'human' ? 'human' : ''}`}>
                                {isSelected && <div className="radio-dot" />}
                              </span>
                              <div className="score-label-container">
                                <span className="score-label">
                                  {score} - {getScoreLabel(score)}
                                </span>
                                {isSelected && (
                                  <div className="grading-indicator">
                                    {gradingSource[key] === 'ai' ? (
                                      <div className="ai-indicator">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="#8b5cf6" strokeWidth="2" />
                                        </svg>
                                        <span>AI Graded</span>
                                      </div>
                                    ) : (
                                      <div className="human-indicator">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#3b82f6" strokeWidth="2" />
                                          <circle cx="12" cy="7" r="4" stroke="#3b82f6" strokeWidth="2" />
                                        </svg>
                                        <span>Human Graded</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </label>
                          </div>
                          <div className="score-description">
                            {section.descriptions[score]}
                          </div>
                        </div>
                      );
                    })}
                  </div>


                </div>
              )}
            </div>
          ))}

          <div className="feedback-section-global">
            <h3>Overall Feedback</h3>
            <div className="feedback-content">
              {Object.values(gradingSource).some(source => source === 'human') ? (
                <div>
                  <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#faf5ff', borderRadius: '6px', border: '1px solid #e9d5ff' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#8b5cf6' }}>Original AI Feedback:</h4>
                    <p className="feedback-text" style={{ margin: '0', color: '#6b7280', fontSize: '14px', lineHeight: '1.5' }}>
                      {originalAIFeedback}
                    </p>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>Your Additional Feedback:</h4>
                    <textarea
                      className="feedback-textarea"
                      placeholder="Add your additional feedback for this essay..."
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      rows={4}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#8b5cf6' }}>AI Feedback:</h4>
                  <p className="feedback-text">{originalAIFeedback}</p>
                </div>
              )}
            </div>
          </div>

        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={handleCancel}>
            Cancel
          </button>
          <button className="save-button" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditScoreModal;