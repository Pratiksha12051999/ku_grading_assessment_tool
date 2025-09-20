import React from 'react';
import './Header.css';
import kiteLogo from '../../assets/kite-logo.png';
import kuLogo from '../../assets/ku-logo.png';

function Header({ showBackButton = false, onBackClick }) {
    return (
        <div className="header-container">
            <div className="header-content">
                <div className="header-left">
                    {showBackButton && (
                        <button className="back-button" onClick={onBackClick}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <polyline points="15,18 9,12 15,6" stroke="currentColor" strokeWidth="2" />
                            </svg>
                            Back to Upload
                        </button>
                    )}
                    <div
                        className="kite-logo"
                        style={{ backgroundImage: `url('${kiteLogo}')` }}
                    />
                </div>
                <div className="header-title">
                    <p>Automated Essay Grading Platform</p>
                </div>
                <div
                    className="ku-logo"
                    style={{ backgroundImage: `url('${kuLogo}')` }}
                />
            </div>
        </div>
    );
}

export default Header;