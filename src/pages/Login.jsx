// Packages
import React, { useEffect, useState } from 'react'
import { useNavigate } from "react-router";
import { apiFetch, initAuth, setAccessToken } from "../api";
import { getHomePathForRole } from "../components/RequireRole";
import { Helmet } from 'react-helmet'

// Styles
import '../styles/root_variables.css'
import '../styles/LoginStyle.css'

// Images
import DepedLogo from '../images/DepedLogo.png'
import logo from '../images/logo.png'

// const AuthContext = createContext(null);

function Login() {
    // Remember me Checkbox
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const navigate = useNavigate()
    const [lgErrorMessage, setLgErrorMessage] = useState("")
    const [loading, setLoading] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);

    const navigateToFirstLoginChangePassword = (mail, uid, replace = true) => {
        if (!mail || !uid) {
            navigate("/dashboard", { replace });
            return;
        }
        navigate(`/ChangePassword/${encodeURIComponent(mail)}/${uid}`, { replace });
    };

    useEffect(() => {
        let isMounted = true;
        const checkExistingLogin = async () => {
            const data = await initAuth();
            if (!isMounted) {
                return;
            }
            if (data?.status) {
                if (data.is_first_login) {
                    navigateToFirstLoginChangePassword(data.email, data.id, true);
                } else {
                    // Admins go to /admin, teachers to /dashboard
                    navigate(getHomePathForRole(data.role), { replace: true });
                }
                return;
            }
            setCheckingAuth(false);
        };
        checkExistingLogin();
        return () => {
            isMounted = false;
        };
    }, [navigate]);

    const handleLogin = async (event) => {
        event.preventDefault();
        if (loading || checkingAuth) {
            console.log("loading...")
            return;
        }
        const emailInput = document.getElementById('email').value;
        const passwordInput = document.getElementById('password').value;
        
        setLoading(true);
        console.log(emailInput, passwordInput)
        apiFetch({
            method: "post",
            url: "/auth_login",
            data: {
                email: emailInput,
                password: passwordInput,
                remember: rememberMe,
            },
        })
            .then(response => {
                const data = response.data;
                console.log(data);

                if (data.status) {
                    console.log(data.status); // Should be true
                    setAccessToken(data.access_token);
                    
                    if(data.user.is_first_login) {
                      // **Note: if first login, it should naviggate to changhe password
                      console.log(data.user.is_first_login);
                      navigateToFirstLoginChangePassword(data.user.mail, data.user.user_id, true);
                    } else {
                      // Admins go to /admin, teachers to /dashboard
                      navigate(getHomePathForRole(data.user.role), { replace: true });
                    }
                    
                    // alert("success!")
                    setLgErrorMessage("")
                } else {
                    // A deactivated account, or a teacher whose school is archived, gets the server's explanation
                    const message = data.code === "account_blocked" && data.message
                        ? data.message
                        : "Invalid email or password. Please try again.";
                    setLgErrorMessage(message);
                    alert(message)
                }
            })
            .catch(error => {
                console.error("Login error:", error);
                alert("An error occurred during login.");
            })
            .finally(() => {
                setLoading(false);
            });
    }

    const handleTogglePassword = () => {
      setShowPassword((prev) => !prev);
    }

    if (checkingAuth) {
        return null;
    }

    return (
      <div className="app-container">

        <Helmet>
            <title>Feeding Program | Login</title>
        </Helmet>

        {/* Left Side - Login Form */}
        <div className="login-section">
          <div className="login-content">
            {/* Logo/Brand */}
            <div className="brand-section">
              <div className="logo-icon">
                <img src={DepedLogo} alt="Deped Logo" draggable="false" className='logo-deped' />
                <img src={logo} alt="Logo" draggable="false" className='logo-feedprogram' />
              </div>
              <h1 className="brand-title">Feeding Program</h1>
              <p className="brand-subtitle">Welcome Teachers. Sign in to monitor student nutrition.</p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label htmlFor="email" className="form-label">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <div className="password-header">
                  <label htmlFor="password" className="form-label">
                    Password
                  </label>
                  <a href="#" className="forgot-link">
                    Forgot password?
                  </a>
                </div>
                <div className="password-input-wrapper">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    required
                    className="form-input password-input"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={handleTogglePassword}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
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

              <div className="remember-me">
                <input 
                  id="remember" 
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label htmlFor="remember">Remember me</label>
              </div>

              <button type="submit" className="submit-button">
                Sign In
              </button>
            </form>

            {/* Divider */}
            <div className="divider">
              <div className="divider-line"></div>
              <span className="divider-text">Or continue with</span>
            </div>

            {/* Social Login Buttons */}
            {/* <div className="social-buttons">
              <button type="button" className="social-button">
                <svg viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </button>
              <button type="button" className="social-button">
                <svg fill="#1877F2" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                Facebook
              </button>
            </div> */}

            {/* Sign Up Link */}
            <p className="signup-link">
              Don't have an account?{" "}
              <a href="#">Sign up</a>
            </p>
          </div>
        </div>

        {/* Right Side - Blue Gradient Background */}
        <div className="features-section">
          {/* Decorative circles */}
          <div className="decorative-circle-1"></div>
          <div className="decorative-circle-2"></div>
          
          <div className="features-content">
            <h2 className="features-title">Monitor Student Health</h2>
            <p className="features-description">
              Track BMI and nutritional intake for a healthier future. Join us in ensuring student wellness.
            </p>
            <div className="features-list">
              <div className="feature-item">
                <div className="feature-icon">
                  <svg
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div className="feature-content">
                  <h4>Track BMI & Intake</h4>
                  <p>
                    Your data is protected.
                  </p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                  <svg
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div className="feature-content">
                  <h4>Easy Monitoring</h4>
                  <p>
                    Intuitive interface designed for the best user experience
                  </p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                  <svg
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div className="feature-content">
                  <h4>Support Student Health</h4>
                  <p>
                    Our team is always here to help you succeed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
}

export default Login
