// Packages
import React from 'react'
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
// Token-aware axios: attaches the login token and renews it when it expires (see ../api.js)
import { authAxios as axios } from "../api";
import { useNavigate } from "react-router";
import { logout } from "../api";

// Styles
import "../styles/ChangePasswordStyle.css";

function ChangePassword() {
    const navigate = useNavigate()
    const { userMail, uid } = useParams();

    // const [email, setEmail] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    useEffect(() => {
        const handleBrowserBack = async () => {
            const confirmBack = window.confirm(
                `Ooops! You are leaving the Change Password page. Login with different account?`
            );

            if (!confirmBack) {
                return;
            }

            await logout();
            navigate("/login", { replace: true });
        };

        // Add a history entry so browser Back can be intercepted on this page
        window.history.pushState({ changePasswordGuard: true }, "", window.location.href);
        window.addEventListener("popstate", handleBrowserBack);

        return () => {
            window.removeEventListener("popstate", handleBrowserBack);
        };
    }, [navigate]);

    const [loading, setLoading] = useState(false);
    const toggleCurrentPassword = () => setShowCurrentPassword((prev) => !prev);
    const toggleNewPassword = () => setShowNewPassword((prev) => !prev);
    const toggleConfirmPassword = () => setShowConfirmPassword((prev) => !prev);
    const handleSubmit = (e) => {
    e.preventDefault();
    // !Block repetetive clicks!
    if (loading) {
        console.log("loading...")
        return;
    }
    setLoading(true);
    // Basic validation
    if (currentPassword == confirmPassword) {
        alert("Current password and new password should not match!");
        setLoading(false);
        return;
    }
    if (newPassword !== confirmPassword) {
        alert("New password and confirm password do not match!");
        setLoading(false);
        return;
    }

    console.log("Password change attempted with:", {
        uid,
        userMail,
        currentPassword,
        newPassword,
    });

    // Handle password change logic here
    axios.post(`/api/auth_first_update_password`, {
            uid: uid,
            email: userMail,
            currrentPassword: currentPassword,
            newPassword: newPassword
        }).then(response => {
            const data = response.data
            console.log(data.status);

            if (data.status == 3) {
                alert("Incorrect Password")
            } else if (data.status == 1) {
                navigate("/login")
            } else {
                alert("An error occurred in changing password. Please try again!");
            }
        }).catch(error => {
            console.error("Login error:", error);
            alert("An error occurred in changing password.");
        }).finally(() => {
            setLoading(false);
        });


    
    };

    return (
        <div className="change-password-container">
            {/* Left Side - Change Password Form */}
            <div className="change-password-section">
                <div className="change-password-content">
                {/* Logo/Brand */}
                <div className="change-password-brand-section">
                    <div className="change-password-logo-icon">
                    <svg
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                        />
                    </svg>
                    </div>
                    <h1 className="change-password-brand-title">Change Password</h1>
                    <p className="change-password-brand-subtitle">
                    Update your password to keep your account secure <br /> 
                    <i>Note: For first login only.</i>
                    </p>
                </div>

                {/* Change Password Form */}
                <form onSubmit={handleSubmit} className="change-password-form">
                    <div className="change-password-form-group">
                    <label htmlFor="email" className="change-password-form-label">
                        Email Address
                    </label>
                    <input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={userMail}
                        required
                        disabled
                        className="change-password-form-input"
                    />
                    </div>

                    <div className="change-password-form-group">
                    <label htmlFor="current-password" className="change-password-form-label">
                        Current Password
                    </label>
                    <div className="change-password-input-wrapper">
                        <input
                            id="current-password"
                            type={showCurrentPassword ? "text" : "password"}
                            placeholder="Enter your current password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                            className="change-password-form-input change-password-password-input"
                        />
                        <button
                            type="button"
                            className="change-password-toggle"
                            onClick={toggleCurrentPassword}
                            aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                            aria-pressed={showCurrentPassword}
                        >
                            {showCurrentPassword ? (
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path
                                        fill="currentColor"
                                        d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
                                    />
                                </svg>
                            ) : (
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path
                                        fill="currentColor"
                                        d="M2.1 3.51 3.5 2.1l18.4 18.39-1.41 1.41-3.09-3.09C15.78 19.56 13.94 20 12 20c-5 0-9.27-3.11-11-7 1-2.25 2.75-4.19 4.95-5.45L2.1 3.51zM12 6c1.3 0 2.54.25 3.69.7l-1.65 1.65A3 3 0 0 0 9.65 12L7.1 9.45A9.55 9.55 0 0 0 4.14 13c1.52 3.04 5 5 7.86 5 1.27 0 2.51-.28 3.63-.8l-1.47-1.47A5 5 0 0 1 7 12c0-1.02.3-1.97.82-2.77L5.98 7.39A9.86 9.86 0 0 1 12 6zm9.86 7c-.73 1.46-1.84 2.74-3.22 3.69l-1.48-1.48A7.5 7.5 0 0 0 19.86 13c-1.52-3.04-5-5-7.86-5-.86 0-1.72.12-2.54.35l-1.62-1.62A10.3 10.3 0 0 1 12 6c5 0 9.27 3.11 11 7z"
                                    />
                                </svg>
                            )}
                        </button>
                    </div>
                    </div>

                    <div className="change-password-form-group">
                    <label htmlFor="new-password" className="change-password-form-label">
                        New Password
                    </label>
                    <div className="change-password-input-wrapper">
                        <input
                            id="new-password"
                            type={showNewPassword ? "text" : "password"}
                            placeholder="Enter your new password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            className="change-password-form-input change-password-password-input"
                        />
                        <button
                            type="button"
                            className="change-password-toggle"
                            onClick={toggleNewPassword}
                            aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                            aria-pressed={showNewPassword}
                        >
                            {showNewPassword ? (
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path
                                        fill="currentColor"
                                        d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
                                    />
                                </svg>
                            ) : (
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path
                                        fill="currentColor"
                                        d="M2.1 3.51 3.5 2.1l18.4 18.39-1.41 1.41-3.09-3.09C15.78 19.56 13.94 20 12 20c-5 0-9.27-3.11-11-7 1-2.25 2.75-4.19 4.95-5.45L2.1 3.51zM12 6c1.3 0 2.54.25 3.69.7l-1.65 1.65A3 3 0 0 0 9.65 12L7.1 9.45A9.55 9.55 0 0 0 4.14 13c1.52 3.04 5 5 7.86 5 1.27 0 2.51-.28 3.63-.8l-1.47-1.47A5 5 0 0 1 7 12c0-1.02.3-1.97.82-2.77L5.98 7.39A9.86 9.86 0 0 1 12 6zm9.86 7c-.73 1.46-1.84 2.74-3.22 3.69l-1.48-1.48A7.5 7.5 0 0 0 19.86 13c-1.52-3.04-5-5-7.86-5-.86 0-1.72.12-2.54.35l-1.62-1.62A10.3 10.3 0 0 1 12 6c5 0 9.27 3.11 11 7z"
                                    />
                                </svg>
                            )}
                        </button>
                    </div>
                    </div>

                    <div className="change-password-form-group">
                    <label htmlFor="confirm-password" className="change-password-form-label">
                        Confirm Password
                    </label>
                    <div className="change-password-input-wrapper">
                        <input
                            id="confirm-password"
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Confirm your new password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            className="change-password-form-input change-password-password-input"
                        />
                        <button
                            type="button"
                            className="change-password-toggle"
                            onClick={toggleConfirmPassword}
                            aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                            aria-pressed={showConfirmPassword}
                        >
                            {showConfirmPassword ? (
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path
                                        fill="currentColor"
                                        d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
                                    />
                                </svg>
                            ) : (
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path
                                        fill="currentColor"
                                        d="M2.1 3.51 3.5 2.1l18.4 18.39-1.41 1.41-3.09-3.09C15.78 19.56 13.94 20 12 20c-5 0-9.27-3.11-11-7 1-2.25 2.75-4.19 4.95-5.45L2.1 3.51zM12 6c1.3 0 2.54.25 3.69.7l-1.65 1.65A3 3 0 0 0 9.65 12L7.1 9.45A9.55 9.55 0 0 0 4.14 13c1.52 3.04 5 5 7.86 5 1.27 0 2.51-.28 3.63-.8l-1.47-1.47A5 5 0 0 1 7 12c0-1.02.3-1.97.82-2.77L5.98 7.39A9.86 9.86 0 0 1 12 6zm9.86 7c-.73 1.46-1.84 2.74-3.22 3.69l-1.48-1.48A7.5 7.5 0 0 0 19.86 13c-1.52-3.04-5-5-7.86-5-.86 0-1.72.12-2.54.35l-1.62-1.62A10.3 10.3 0 0 1 12 6c5 0 9.27 3.11 11 7z"
                                    />
                                </svg>
                            )}
                        </button>
                    </div>
                    </div>

                    <button type="submit" className="change-password-submit-button">
                    Update Password
                    </button>
                </form>
                </div>
            </div>
        </div>
    );
};

export default ChangePassword
