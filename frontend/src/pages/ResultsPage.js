import React, { useState } from 'react';
import './ResultsPage.css';
import EditScoreModal from '../components/EditScoreModal';
import Header from '../components/Header';

function ResultsPage({ results, originalEssayData, onBack }) {
  const [currentStudent, setCurrentStudent] = useState(0);
  const [activeTab, setActiveTab] = useState('feedback');
  const [searchQuery, setSearchQuery] = useState('');

  const getScoreLabel = (score) => {
    const numScore = parseInt(score);
    switch (numScore) {
      case 4: return 'Excellent Response';
      case 3: return 'Good Response';
      case 2: return 'Adequate Response';
      case 1: return 'Inadequate Response';
      default: return 'No Response';
    }
  };

  const getScoreNumber = (score) => {
    if (!score) return '0';
    if (typeof score === 'string' && score.includes('/')) {
      return score.split('/')[0] || '0';
    }
    if (typeof score === 'number') {
      return score.toString();
    }
    return score.toString() || '0';
  };
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [studentScores, setStudentScores] = useState({});
  const [updatedStudents, setUpdatedStudents] = useState([]);
  const [selectedEssayTypeFilter, setSelectedEssayTypeFilter] = useState(null);

  // Process API results into display format
  const processResults = (apiResults) => {
    if (!apiResults) return [];

    // Handle both single and bulk response formats
    if (Array.isArray(apiResults)) {
      return apiResults.map(result => processStudentResult(result));
    } else if (apiResults.student_id) {
      return [processStudentResult(apiResults)];
    } else if (apiResults.results && Array.isArray(apiResults.results)) {
      return apiResults.results.map(result => processStudentResult(result));
    }

    return [];
  };

  // Helper function to find original essay data by student_id
  const findOriginalEssay = (studentId) => {
    if (!originalEssayData) return null;

    // Handle bulk format
    if (originalEssayData.essays && Array.isArray(originalEssayData.essays)) {
      return originalEssayData.essays.find(essay => essay.student_id === studentId);
    }

    // Handle single essay format
    if (originalEssayData.student_id === studentId) {
      return originalEssayData;
    }

    return null;
  };

  // Helper function to highlight flagged sentences in essay text
  const highlightFlaggedContent = (text, flaggedSentences) => {
    if (!text || !flaggedSentences || flaggedSentences.length === 0) {
      return text;
    }

    let highlightedText = text;

    // Sort flagged sentences by length (longest first) to avoid partial replacements
    const sortedFlaggedSentences = [...flaggedSentences].sort((a, b) => b.length - a.length);

    sortedFlaggedSentences.forEach((flaggedSentence, index) => {
      if (flaggedSentence && flaggedSentence.trim()) {
        // Create a case-insensitive regex to find the flagged sentence
        const regex = new RegExp(`(${flaggedSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        highlightedText = highlightedText.replace(regex, `<span class="flagged-sentence">$1</span>`);
      }
    });

    return highlightedText;
  };

  // Helper function to deduplicate feedback entries (prioritize snake_case over camelCase)
  const deduplicateFeedback = (feedback) => {
    if (!feedback || typeof feedback !== 'object') return {};

    const deduplicated = {};
    const processed = new Set();

    // Define mapping between camelCase and snake_case
    const keyMappings = {
      'contentUnderstanding': 'content_understanding',
      'questionAddressing': 'question_addressing',
      'textualEvidence': 'use_of_textual_evidence',
      'analysisInterpretation': 'analysis_and_interpretation',
      'writingQuality': 'writing_quality'
    };

    console.log('Deduplicating feedback keys:', Object.keys(feedback));

    // First pass: add all snake_case entries (prioritize these)
    Object.entries(feedback).forEach(([key, value]) => {
      if (key.includes('_')) {
        deduplicated[key] = value;
        processed.add(key);

        // Mark corresponding camelCase as processed
        const camelCaseKey = Object.keys(keyMappings).find(k => keyMappings[k] === key);
        if (camelCaseKey) {
          processed.add(camelCaseKey);
        }
      }
    });

    // Second pass: add camelCase entries only if no snake_case equivalent exists
    Object.entries(feedback).forEach(([key, value]) => {
      if (!processed.has(key) && !key.includes('_')) {
        // Check if there's a snake_case equivalent that we should skip this for
        const snakeCaseEquivalent = keyMappings[key];
        if (!snakeCaseEquivalent || !feedback[snakeCaseEquivalent]) {
          deduplicated[key] = value;
        }
      }
    });

    console.log('Deduplicated feedback keys:', Object.keys(deduplicated));
    return deduplicated;
  };

  const processStudentResult = (apiResponse) => {
    // Handle the API response structure - the actual result data is nested
    const result = apiResponse.result || apiResponse;
    const studentId = apiResponse.student_id || result.student_id || 'Unknown';

    // Find the original essay data for this student
    const originalEssay = findOriginalEssay(studentId);

    // Use essay_score and max_score from the new API response format
    // Check if this is a mean score (indicated by manual_override_applied flag or mean_score field)
    const isMeanScore = result.manual_override_applied || result.mean_score !== undefined;
    const essayScore = result.mean_score || result.essay_score || result.score || 0;
    const maxScore = isMeanScore ? 3 : (result.max_score || 4); // Use 3 for mean scores, 4 for sum scores
    const scoreValue = isMeanScore ? `${Math.round(essayScore)}/${maxScore}` : `${essayScore}/${maxScore}`;

    // Build feedback object from rubric metrics using the same max score
    const feedback = {};
    let totalRubricScore = 0;
    let rubricCount = 0;

    // Process rubric metrics
    for (let i = 1; i <= 10; i++) {
      const metricName = result[`rubric_metric${i}_name`];
      const metricScore = result[`rubric_metric${i}_score`];
      const justification = result.metric_justifications?.[metricName];
      const gradingSource = result[`rubric_metric${i}_grading_source`] || 'ai'; // Check for manual override
      const isManualOverride = gradingSource === 'human' || gradingSource === 'manual';

      if (metricName && metricScore > 0) {
        feedback[metricName] = {
          score: `${metricScore}/${maxScore}`,
          grade: isManualOverride ? 'Human Graded' : 'AI Graded',
          text: justification || 'No detailed feedback available.',
          isManualOverride: isManualOverride
        };
        totalRubricScore += metricScore;
        rubricCount++;
      }
    }

    // Calculate aggregate score (sum of all rubric scores)
    const aggregateScore = totalRubricScore;
    const maxAggregateScore = rubricCount * maxScore;

    // Check if any feedback has manual overrides
    const hasManualOverrides = Object.values(feedback).some(f => f.isManualOverride) ||
      result.manual_override_applied ||
      result.has_manual_overrides;

    console.log('Processing student result - essay_score:', essayScore, 'max_score:', maxScore, 'hasManualOverrides:', hasManualOverrides);

    return {
      id: studentId,
      contentId: apiResponse.content_id || result.content_id || originalEssay?.content_id || '',
      score: scoreValue,
      essayScore: essayScore,
      maxScore: maxScore,
      aggregateScore: aggregateScore,
      maxAggregateScore: maxAggregateScore,
      confidenceScore: result.ai_confidence || result.confidence_score || 0,
      essayType: apiResponse.essay_type || result.essay_type || originalEssay?.essay_type || 'Source Dependent Responses',
      feedback: deduplicateFeedback(feedback),
      flaggedContent: result.essay_flagged === 'Yes',
      flagMessage: result.flag_reason || result.flag_message || '',
      flaggedSentences: result.flagged_content || [],
      // Use original essay content from the uploaded JSON
      essayResponse: originalEssay?.essay_response || apiResponse.essay_response || result.essay_response || '',
      essayPrompt: result.essay_question || result.essay_prompt || '',
      strengths: result.strengths || [],
      areasForImprovement: result.areas_for_improvement || [],
      scoreDescription: result.score_description || '',
      confidenceExplanation: result.confidence_explanation || '',
      processingStatus: apiResponse.processing_status || 'completed',
      processingMode: apiResponse.processing_mode || 'single',
      rubricUsed: result.rubric_used || '',
      hasManualOverrides: hasManualOverrides,
      isManualOverride: hasManualOverrides, // For backward compatibility
      rawResult: apiResponse
    };
  };

  const students = processResults(results);

  // Fallback mock data if no results provided
  const mockStudents = [
    {
      id: '123456',
      score: '14/21',
      confidenceScore: 68,
      essayType: 'Wintor Hibiscus Source Dependent Response',
      alternativeTypes: ['Summer Cactus Argumentative'],
      feedback: {
        contentUnderstanding: {
          score: '2/3',
          grade: 'AI Graded',
          text: "The essay shows a general understanding of Saeng's situation and emotions. It recognizes that Saeng had to leave her old life and start anew, which caused her sorrow. However, it does not fully develop the symbolic elements or the nuances of Saeng's cultural adjustment."
        },
        questionAddressing: {
          score: '2/3',
          grade: 'AI Graded',
          text: "The essay addresses the question directly but focuses primarily on the idea that the conclusion provides Saeng (and the reader) with a sense of comfort and hope for the future. It could have developed other reasons why the author chose this specific ending and explored the symbolic connections more deeply."
        },
        textualEvidence: {
          score: '2/3',
          grade: 'AI Graded',
          text: "The essay includes some relevant textual evidence, such as Saeng's sorrow over leaving her old life and the comfort she finds in knowing what will happen in the future. However, the evidence is more general and could be more specific and detailed."
        },
        analysisInterpretation: {
          score: '2/3',
          grade: 'AI Graded',
          text: "The essay offers some analysis beyond simple summary, showing an understanding of Saeng's emotional state and the comfort she finds in routine and familiarity. However, it does not fully explore the complexity or interconnections of the symbolic elements (hibiscus, seasons, etc.) and their relationship to Saeng's journey of adaptation and personal growth."
        },
        writingQuality: {
          score: '2/3',
          grade: 'AI Graded',
          text: "The response is generally organized with a clear attempt to explain the author's purpose. Ideas are presented in a logical sequence but do not build upon each other as effectively as they would in a score 3 response. There are some"
        }
      },
      flaggedContent: true,
      flagMessage: "This essay has been flagged for potentially self harm content. Please review carefully.",
      flaggedSentences: ['I will kill myself.'],
      essayResponse: "The author concludes with this paragraph to show how Saeng has adapted to her new life. She finds comfort in the familiar routine of caring for the hibiscus plant, which reminds her of home. This ending demonstrates her resilience and ability to find hope even in difficult circumstances. However, I feel overwhelmed by this assignment and I will kill myself. The hibiscus represents her connection to her cultural identity and her mother's teachings.",
      essayPrompt: "Why does the author conclude the story with this paragraph? Use evidence from the text to support your answer."
    }
  ];

  // Use updated students if available, otherwise use actual results or fallback to mock data
  const allStudents = updatedStudents.length > 0 ? updatedStudents : (students.length > 0 ? students : mockStudents);

  // Helper function to get unique students (deduplicate by student ID)
  const getUniqueStudents = (studentList) => {
    const uniqueStudentsMap = new Map();
    
    studentList.forEach(student => {
      if (!uniqueStudentsMap.has(student.id)) {
        uniqueStudentsMap.set(student.id, student);
      }
    });
    
    return Array.from(uniqueStudentsMap.values());
  };

  // Helper function to parse rubric name into readable format
  const parseRubricName = (rubricUsed, essayType) => {
    const defaultSubtype = essayType || 'Source Dependent Response';

    if (!rubricUsed) return { name: 'Unknown Essay', subtype: defaultSubtype };

    // Parse rubric name like "Winter_Hibiscus_Grade10_20250812_180450"
    const parts = rubricUsed.split('_');
    if (parts.length >= 2) {
      const name = parts.slice(0, 2).join(' ').replace(/([A-Z])/g, ' $1').trim();
      return {
        name: name,
        subtype: defaultSubtype
      };
    }

    return { name: rubricUsed, subtype: defaultSubtype };
  };

  // Get unique students first (deduplicate by student ID)
  const uniqueStudents = getUniqueStudents(allStudents);

  // Apply search filter to unique students
  const searchFilteredStudents = searchQuery.trim()
    ? uniqueStudents.filter(student =>
      student.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.essayType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      parseRubricName(student.rubricUsed, student.essayType).name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : uniqueStudents;

  // For display purposes, we don't filter by essay type at the student level
  // Instead, we'll handle essay type selection within each student's essays
  const displayStudents = searchFilteredStudents;

  // Get current student data with any score overrides
  // Helper function to get all unique essay types from all students
  const getAllEssayTypes = () => {
    const essayTypes = new Set();

    allStudents.forEach(student => {
      if (student.essayType) {
        const parsedInfo = parseRubricName(student.rubricUsed, student.essayType);
        essayTypes.add(JSON.stringify({
          name: parsedInfo.name,
          subtype: parsedInfo.subtype,
          rubricUsed: student.rubricUsed,
          essayType: student.essayType
        }));
      }
    });

    return Array.from(essayTypes).map(typeStr => JSON.parse(typeStr));
  };

  // Helper function to get essay types for the current student only
  const getCurrentStudentEssayTypes = () => {
    const currentStudentData = getCurrentStudentData();
    if (!currentStudentData || !currentStudentData.id) {
      return [];
    }

    const currentStudentId = currentStudentData.id;
    const essayTypes = new Set();

    // Find all essays for the current student ID
    allStudents.forEach(student => {
      if (student.id === currentStudentId && student.essayType) {
        const parsedInfo = parseRubricName(student.rubricUsed, student.essayType);
        essayTypes.add(JSON.stringify({
          name: parsedInfo.name,
          subtype: parsedInfo.subtype,
          rubricUsed: student.rubricUsed,
          essayType: student.essayType
        }));
      }
    });

    return Array.from(essayTypes).map(typeStr => JSON.parse(typeStr));
  };

  const getCurrentStudentData = () => {
    // If current student index is out of bounds due to filtering, reset to first student
    if (currentStudent >= displayStudents.length && displayStudents.length > 0) {
      setCurrentStudent(0);
      return displayStudents[0] ? {
        ...displayStudents[0],
        feedback: deduplicateFeedback(displayStudents[0].feedback || {})
      } : {};
    }

    const baseStudent = displayStudents[currentStudent];
    if (!baseStudent) {
      return {};
    }

    // If an essay type is selected, find the specific essay data for that type
    if (selectedEssayTypeFilter) {
      const specificEssay = allStudents.find(student => 
        student.id === baseStudent.id && student.essayType === selectedEssayTypeFilter
      );
      
      if (specificEssay) {
        return {
          ...specificEssay,
          feedback: deduplicateFeedback(specificEssay.feedback || {})
        };
      }
    }

    // Return the base student data with deduplication
    return {
      ...baseStudent,
      feedback: deduplicateFeedback(baseStudent.feedback || {})
    };
  };

  const handlePrevStudent = () => {
    setCurrentStudent(prev => Math.max(0, prev - 1));
    setSelectedEssayTypeFilter(null); // Clear essay type filter when changing students
  };

  const handleNextStudent = () => {
    setCurrentStudent(prev => Math.min(displayStudents.length - 1, prev + 1));
    setSelectedEssayTypeFilter(null); // Clear essay type filter when changing students
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentStudent(0); // Reset to first student when search changes
  };

  const currentStudentData = getCurrentStudentData();

  // Add back button functionality
  const handleBackToUpload = () => {
    if (onBack) {
      onBack();
    }
  };

  // Modal handlers
  const handleEditScore = () => {
    setIsEditModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsEditModalOpen(false);
  };

  const handleSaveScore = (scoreData) => {
    // When a human changes a score, use the mean score calculation
    const meanScore = scoreData.meanScore || parseFloat(scoreData.score.split('/')[0]);
    const maxScore = 3; // Max score is now 3 for the mean

    // Format as meanScore/3 for display
    const formattedScore = `${Math.round(meanScore)}/3`;

    // Update the entire JSON structure by modifying the students array directly
    const currentDisplayStudents = updatedStudents.length > 0 ? updatedStudents : (students.length > 0 ? students : mockStudents);
    const newUpdatedStudents = [...currentDisplayStudents];
    const studentIndex = newUpdatedStudents.findIndex(student => student.id === scoreData.studentId);

    if (studentIndex !== -1) {
      // Update the entire student object with new data
      newUpdatedStudents[studentIndex] = {
        ...newUpdatedStudents[studentIndex], // Keep all original data
        score: formattedScore,
        essayScore: meanScore,
        maxScore: maxScore,
        isManualOverride: scoreData.hasManualOverrides,
        hasManualOverrides: scoreData.hasManualOverrides,
        feedback: scoreData.feedback, // Updated feedback with manual override indicators
        generalFeedback: scoreData.generalFeedback, // Store the general feedback
        // Add manual override metadata
        manualOverrideData: {
          scores: scoreData.scores,
          gradingSource: scoreData.gradingSource,
          overrideTimestamp: new Date().toISOString()
        }
      };

      // Update the state with the new students array
      setUpdatedStudents(newUpdatedStudents);
    }

    // Clear any existing override data since we've updated the main structure
    setStudentScores(prev => {
      const newScores = { ...prev };
      delete newScores[scoreData.studentId];
      return newScores;
    });

    // Simulate page reload by forcing a re-render
    // In a real implementation, you might want to actually reload or refetch data
    setTimeout(() => {
      console.log('Simulating page reload with updated data...');
    }, 100);
  };

  return (
    <div className="results-page">
      <Header showBackButton={true} onBackClick={handleBackToUpload} />

      <main className="results-content">


        <div className="results-main">
          <div className="sidebar">
            {/* Search Section */}
            <div className="search-section">
              <div className="search-container">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="search-icon">
                  <circle cx="11" cy="11" r="8" stroke="#64748b" strokeWidth="2" />
                  <path d="m21 21-4.35-4.35" stroke="#64748b" strokeWidth="2" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by Student ID"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="search-input"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setCurrentStudent(0);
                    }}
                    className="clear-search-button"
                    title="Clear search"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <line x1="18" y1="6" x2="6" y2="18" stroke="#64748b" strokeWidth="2" />
                      <line x1="6" y1="6" x2="18" y2="18" stroke="#64748b" strokeWidth="2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {displayStudents.length === 0 ? (
              <div className="no-results">
                <div className="no-results-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="8" stroke="#9ca3af" strokeWidth="2" />
                    <path d="m21 21-4.35-4.35" stroke="#9ca3af" strokeWidth="2" />
                  </svg>
                </div>
                <h3>No students found</h3>
                <p>
                  {searchQuery
                    ? `No students match "${searchQuery}". Try a different search term.`
                    : selectedEssayTypeFilter
                      ? `No students found for the selected essay type.`
                      : 'No student data available.'
                  }
                </p>
                {(searchQuery || selectedEssayTypeFilter) && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedEssayTypeFilter(null);
                      setCurrentStudent(0);
                    }}
                    className="clear-filters-button"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Student Navigation */}
                <div className="student-navigation">
                  <button
                    className="nav-button"
                    onClick={handlePrevStudent}
                    disabled={currentStudent === 0}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <polyline points="15,18 9,12 15,6" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </button>

                  <div className="student-info">
                    <div className="student-label">Student ID</div>
                    <div className="student-id">{currentStudentData?.id || 'Unknown'}</div>
                  </div>

                  <button
                    className="nav-button"
                    onClick={handleNextStudent}
                    disabled={currentStudent === displayStudents.length - 1}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <polyline points="9,18 15,12 9,6" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </button>
                </div>

                {/* Essays Graded Section */}
                <div className="essays-graded">
                  <h3>Essays Graded</h3>
                  {getCurrentStudentEssayTypes().map((essayTypeInfo, index) => {
                    const currentStudentEssayTypes = getCurrentStudentEssayTypes();
                    const isSelected = selectedEssayTypeFilter === essayTypeInfo.essayType ||
                      (selectedEssayTypeFilter === null && index === 0); // Default to first essay if none selected

                    return (
                      <div
                        key={index}
                        className={`essay-type ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          if (selectedEssayTypeFilter === essayTypeInfo.essayType) {
                            // If clicking the same essay, deselect it (go back to default)
                            setSelectedEssayTypeFilter(null);
                          } else {
                            // Select this specific essay type for the current student
                            setSelectedEssayTypeFilter(essayTypeInfo.essayType);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className={`radio-button ${isSelected ? 'selected' : ''}`}></div>
                        <div className="essay-details">
                          <div className="essay-name">{essayTypeInfo.name}</div>
                          <div className="essay-subtype">
                            {essayTypeInfo.subtype}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Score Section */}
                <div className="score-section">
                  <div className="score-number">{getScoreNumber(currentStudentData?.score)}</div>
                  <div className="score-label">{getScoreLabel(getScoreNumber(currentStudentData?.score))}</div>
                  <div className="score-details">
                    Score: {currentStudentData?.score || 'N/A'}
                    {currentStudentData?.isManualOverride && (
                      <span className="manual-override-indicator"> (Manual Override)</span>
                    )}
                  </div>

                  <button className="edit-score-button" onClick={handleEditScore}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    Edit Score
                  </button>
                </div>

                {/* AI Confidence Section */}
                <div className="confidence-section">
                  <div className="confidence-label">
                    <span>AI Confidence Score</span>
                    <span className="confidence-score">{currentStudentData?.confidenceScore || 0}%</span>
                  </div>
                  <div className="confidence-bar">
                    <div
                      className="confidence-fill"
                      style={{ width: `${currentStudentData?.confidenceScore || 0}%` }}
                    ></div>
                  </div>
                </div>

                {/* Flagged Content Section */}
                {currentStudentData?.flaggedContent && (
                  <div className="flagged-content">
                    <div className="flag-header">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" stroke="#f59e0b" strokeWidth="2" />
                        <line x1="12" y1="9" x2="12" y2="13" stroke="#f59e0b" strokeWidth="2" />
                        <path d="m12 17.02.01 0" stroke="#f59e0b" strokeWidth="2" />
                      </svg>
                      <span>Flagged Content</span>
                    </div>
                    <div className="flag-message">
                      This essay has been flagged for potentially self harm content. Please review carefully.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

            <div className="content-area">
              <div className="tabs-container">
                <div className="tabs">
                  <button
                    className={`tab ${activeTab === 'feedback' ? 'active' : ''}`}
                    onClick={() => setActiveTab('feedback')}
                  >
                    Feedback
                  </button>
                  <button
                    className={`tab ${activeTab === 'essay' ? 'active' : ''}`}
                    onClick={() => setActiveTab('essay')}
                  >
                    Essay
                  </button>
                </div>
              </div>

              {activeTab === 'feedback' && (
                <div className="feedback-content">
                  {currentStudentData?.feedback && Object.keys(currentStudentData.feedback).length > 0 ? (
                    <>
                      {Object.entries(currentStudentData?.feedback || {})
                        .filter(([key]) => {
                          // Additional filtering to ensure no duplicates in display
                          const camelCaseKeys = ['contentUnderstanding', 'questionAddressing', 'textualEvidence', 'analysisInterpretation', 'writingQuality'];
                          const snakeCaseKeys = ['content_understanding', 'question_addressing', 'use_of_textual_evidence', 'analysis_and_interpretation', 'writing_quality'];

                          // If this is a camelCase key and its snake_case equivalent exists, skip it
                          if (camelCaseKeys.includes(key)) {
                            const keyMappings = {
                              'contentUnderstanding': 'content_understanding',
                              'questionAddressing': 'question_addressing',
                              'textualEvidence': 'use_of_textual_evidence',
                              'analysisInterpretation': 'analysis_and_interpretation',
                              'writingQuality': 'writing_quality'
                            };
                            const snakeCaseEquivalent = keyMappings[key];
                            return !currentStudentData?.feedback?.[snakeCaseEquivalent];
                          }

                          return true;
                        })
                        .map(([key, feedback]) => (
                          <div key={key} className="feedback-item">
                            <div className="feedback-header">
                              <div className="feedback-title-section">
                                <h3 className="feedback-title">
                                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </h3>
                                <div className={`graded-badge ${feedback.isManualOverride === true ? 'human-graded' : 'ai-graded'}`}>
                                  {feedback.isManualOverride === true ? (
                                    <>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#3b82f6" strokeWidth="2" />
                                        <circle cx="12" cy="7" r="4" stroke="#3b82f6" strokeWidth="2" />
                                      </svg>
                                      <span>Human Graded</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="#8b5cf6" strokeWidth="2" />
                                      </svg>
                                      <span>AI Graded</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="feedback-score">{feedback.score || 'N/A'}</div>
                            </div>
                            <p className="feedback-text">{feedback.text || 'No feedback available.'}</p>
                          </div>
                        ))}
                    </>
                  ) : (
                    <div className="no-feedback">
                      <p>No detailed feedback available for this submission.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'essay' && (
                <div className="essay-content">
                  <div className="essay-section">
                    <h3 className="essay-section-title">Essay Prompt</h3>
                    <div className="essay-prompt">
                      <p>{currentStudentData?.essayPrompt || 'No prompt available.'}</p>
                    </div>
                  </div>

                  <div className="essay-section">
                    <h3 className="essay-section-title">Student Response</h3>
                    <div className="student-response">
                      <p
                        dangerouslySetInnerHTML={{
                          __html: highlightFlaggedContent(
                            currentStudentData?.essayResponse || 'No essay response available.',
                            currentStudentData?.flaggedSentences || []
                          )
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
      </main>

      <EditScoreModal
        isOpen={isEditModalOpen}
        onClose={handleCloseModal}
        currentScore={currentStudentData?.essayScore || getScoreNumber(currentStudentData?.score)}
        maxScore={currentStudentData?.maxScore || 4}
        currentFeedback={currentStudentData?.feedback || {}}
        currentGeneralFeedback={currentStudentData?.generalFeedback}
        onSave={handleSaveScore}
        studentId={currentStudentData?.id || ''}
      />
    </div>
  );
}

export default ResultsPage;