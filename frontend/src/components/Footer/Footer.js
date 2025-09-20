import React from 'react';
import './Footer.css';

function Footer() {
  return (
    <footer className="footer-container">
      <div className="footer-content">
        <div className="feature-item">
          <div className="feature-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#0051BA" strokeWidth="2"/>
              <polyline points="14,2 14,8 20,8" stroke="#0051BA" strokeWidth="2"/>
              <line x1="16" y1="13" x2="8" y2="13" stroke="#0051BA" strokeWidth="2"/>
              <line x1="16" y1="17" x2="8" y2="17" stroke="#0051BA" strokeWidth="2"/>
              <polyline points="10,9 9,9 8,9" stroke="#0051BA" strokeWidth="2"/>
            </svg>
          </div>
          <h3 className="feature-title">Auto Essay Type Detection</h3>
          <p className="feature-description">AI automatically identifies different essay types</p>
        </div>

        <div className="feature-item">
          <div className="feature-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#0051BA" strokeWidth="2"/>
              <polyline points="14,2 14,8 20,8" stroke="#0051BA" strokeWidth="2"/>
              <line x1="16" y1="13" x2="8" y2="13" stroke="#0051BA" strokeWidth="2"/>
              <line x1="16" y1="17" x2="8" y2="17" stroke="#0051BA" strokeWidth="2"/>
              <line x1="10" y1="9" x2="8" y2="9" stroke="#0051BA" strokeWidth="2"/>
            </svg>
          </div>
          <h3 className="feature-title">Comprehensive Scoring</h3>
          <p className="feature-description">Detailed rubric-based evaluation with confidence indicators</p>
        </div>

        <div className="feature-item">
          <div className="feature-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" stroke="#0051BA" strokeWidth="2"/>
              <line x1="12" y1="9" x2="12" y2="13" stroke="#0051BA" strokeWidth="2"/>
              <path d="m12 17.02.01 0" stroke="#0051BA" strokeWidth="2"/>
            </svg>
          </div>
          <h3 className="feature-title">Content Safety Flagging</h3>
          <p className="feature-description">Automatic detection of potential self harm content</p>
        </div>

        <div className="feature-item">
          <div className="feature-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="#0051BA" strokeWidth="2"/>
            </svg>
          </div>
          <h3 className="feature-title">Bulk Processing</h3>
          <p className="feature-description">Handle multiple essay responses of students efficiently</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;