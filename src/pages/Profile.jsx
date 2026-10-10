import { useState, useCallback, useEffect } from "react";
import Cropper from "react-easy-crop";
import { useNavigate } from "react-router";
import { Helmet } from 'react-helmet'
// Token-aware axios: attaches the login token and renews it when it expires (see ../api.js)
import { authAxios as axios } from "../api";

import "../styles/ProfileStyle.css";
import "../styles/DashboardStyle.css";

import { initAuth, logout } from "../api";
import Loading from "../components/Loading";
import Logo from "../images/logo.png";


export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const mapUserToFormData = (data) => ({
    firstName: data?.first_name || "",
    middleName: data?.middle_name || "",
    lastName: data?.last_name || "",
    email: data?.email || "",
    mobile: data?.mobile_no || data?.mobile || "",
    schoolName: data?.school_name || data?.schoolName || "",
  });

  const formatDisplayDate = (value) => {
    if (!value) return "No data";
    const raw = String(value).trim();
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return String(value);
    const hasTimezone = /(gmt|utc|z|[+-]\d{2}:?\d{2})$/i.test(raw);
    return parsed.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      ...(hasTimezone ? { timeZone: "UTC" } : {}),
    });
  };

  useEffect(() => {
    let isMounted = true;
    const loadUser = async () => {
      const data = await initAuth();
      if (!isMounted) {
        return;
      }
      if (data?.status) {
        console.log(data)
        setUser(data);
      } else {
        navigate("/");
      }
      setCheckingAuth(false);
    };
    loadUser();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  // Personal information form state
  const [formData, setFormData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    mobile: "",
    schoolName: "",
  });

  const [originalFormData, setOriginalFormData] = useState({ ...formData });
  const [formErrors, setFormErrors] = useState({});
  const [isEdited, setIsEdited] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Profile photo state
  const [profileImage, setProfileImage] = useState(null);
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // Toast notification state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const triggerToast = (message) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  useEffect(() => {
    if (!user) {
      return;
    }
    // console.loogggg
    const next = mapUserToFormData(user);
    setFormData(next);
    setOriginalFormData(next);
    setFormErrors({});
    setIsEdited(false);
  }, [user]);


  // GET ALL SECTION
  const [sections, setSections] = useState([])
  useEffect(() => {
        if (!user?.id) {
            return;
        }

        axios.get("/api/get_all_section", {
            params: {
                userId: user.id,
            }
        })
        .then((response) => {
            const data = response.data;
            console.log(data)
            if (!data?.status) {
                setSections([]);
                return;
            }

            const fetchedSections = (data.sections || []).map((section) => ({
                ...section,
                createdAt: section.createdAt
                    ? new Date(section.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                    })
                    : "",
            }));
            setSections(fetchedSections);
        })
        .catch((error) => {
            console.error("Fetching sections error:", error);
        });
    }, [user?.id]);

  // Account info data
  const accountInfo = {
    teacherId: user?.id ?? "No data",
    // The server now sends the role as "teacher" / "admin"; show it as a label
    role: user?.role === "admin" ? "Admin" : "Teacher",
    dateJoined: formatDisplayDate(user?.date_joined || user?.created_at),
    lastLogin: formatDisplayDate(new Date()),
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name } = e.target;
    let value = e.target.value;

    if (name === "firstName" || name === "middleName" || name === "lastName") {
      if (/[^A-Za-z\s]/.test(value)) {
        return;
      }
    }

    if (name === "mobile") {
      if (!/^\d*$/.test(value)) {
        return;
      }
      value = value.slice(0, 11);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setIsEdited(true);

    // Clear error for this field
    if (formErrors[name]) {
      setFormErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  // Validate form
  const validateForm = () => {
    const errors = {};
    const firstName = String(formData.firstName || "").trim();
    const middleName = String(formData.middleName || "").trim();
    const lastName = String(formData.lastName || "").trim();
    const mobile = String(formData.mobile || "").trim();
    const schoolName = String(formData.schoolName || "").trim();
    const email = String(formData.email || "").trim();
    const lettersOnlyPattern = /^[A-Za-z\s]+$/;

    if (!firstName) {
      errors.firstName = "First name is required";
    } else if (!lettersOnlyPattern.test(firstName)) {
      errors.firstName = "First name must contain letters only.";
    }
    if (!middleName) {
      errors.middleName = "Middle name is required";
    } else if (!lettersOnlyPattern.test(middleName)) {
      errors.middleName = "Middle name must contain letters only.";
    }
    if (!lastName) {
      errors.lastName = "Last name is required";
    } else if (!lettersOnlyPattern.test(lastName)) {
      errors.lastName = "Last name must contain letters only.";
    }
    if (!email) {
      errors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errors.email = "Please enter a valid email address";
    }
    if (!mobile) {
      errors.mobile = "Mobile number is required";
    } else if (!/^\d+$/.test(mobile)) {
      errors.mobile = "Mobile number must contain digits only.";
    } else if (mobile.length !== 11) {
      errors.mobile = "Mobile number must be exactly 11 digits.";
    }
    if (!schoolName) {
      errors.schoolName = "School name is required";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle save changes
  const handleSaveChanges = () => {
    if (isSavingProfile) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    if (!user?.id) {
      alert("Missing user info. Please try again.");
      return;
    }

    const payload = {
      userId: user.id,
      firstName: String(formData.firstName || "").trim(),
      middleName: String(formData.middleName || "").trim(),
      lastName: String(formData.lastName || "").trim(),
      mobileNo: String(formData.mobile || "").trim(),
    };

    setIsSavingProfile(true);
    axios.post("/api/auth_update_user_information", payload)
      .then((response) => {
        const status = response.data?.status;
        if (!status) {
          alert("Something went wrong. Try again later!");
          return;
        }

        const nextFormData = {
          ...formData,
          firstName: payload.firstName,
          middleName: payload.middleName,
          lastName: payload.lastName,
          mobile: payload.mobileNo,
        };

        console.log(nextFormData)
        setFormData(nextFormData);
        setOriginalFormData(nextFormData);
        setIsEdited(false);
        setUser((prev) => ({
          ...(prev || {}),
          first_name: payload.firstName,
          middle_name: payload.middleName,
          last_name: payload.lastName,
          mobile_no: payload.mobileNo,
        }));
        triggerToast("Profile updated successfully!");
      })
      .catch((error) => {
        console.error("Updating profile error:", error);
        alert("An error occurred during profile update.");
      })
      .finally(() => {
        setIsSavingProfile(false);
      });
  };

  // Handle cancel
  const handleCancel = () => {
    setFormData({ ...originalFormData });
    setFormErrors({});
    setIsEdited(false);
  };

  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const validTypes = ["image/jpeg", "image/jpg", "image/png"];
      if (!validTypes.includes(file.type)) {
        triggerToast("Please upload a valid image file (JPG, JPEG, PNG)");
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        triggerToast("File size must be less than 5MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setImageToCrop(reader.result);
        setShowCropper(true);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle crop complete
  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // Create cropped image
  const createCroppedImage = async () => {
    try {
      const croppedImage = await getCroppedImg(
        imageToCrop,
        croppedAreaPixels
      );
      setProfileImage(croppedImage);
      setShowCropper(false);
      triggerToast("Profile photo updated successfully!");
    } catch (e) {
      console.error(e);
    }
  };

  // Cancel cropping
  const cancelCropping = () => {
    setShowCropper(false);
    setImageToCrop(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  // Remove profile photo
  const handleRemovePhoto = () => {
    setProfileImage(null);
    triggerToast("Profile photo removed");
  };

  // Get teacher initials
  const getInitials = () => {
    return `${formData.firstName.charAt(0)}${formData.lastName.charAt(0)}`;
  };

  const linkNavigate = (num) => {
    let myLink = null;
    if (num === 1) myLink = "Dashboard";
    else if (num === 2) return;
    else if (num === 3) myLink = "Students";
    else if (num === 4) myLink = "FeedingProgram";
    else myLink = "404";
    navigate(`/${myLink}`);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  if (checkingAuth) {
    return (
      <div className="comp-loading">
        <Loading />
      </div>
    );
  }

  if (user == null) {
    return null;
  }

  return (
    <div className="profile-container">
      {/* Left Sidebar */}
      <Helmet>
          <title>Feeding Program | Profile</title>
      </Helmet>
      <aside className="dashboard-sidebar">
        <div className="dashboard-logo">
          <div className="dashboard-logo-icon">
            <div className="dashboard-logo-circle">
              <img src={Logo} alt="logo" />
            </div>
            <div className="dashboard-logo-text">
              <h3>Feeding Program</h3>
              <p>Teacher Portal</p>
            </div>
          </div>
        </div>

        <nav className="dashboard-nav">
          <button className="dashboard-nav-item" onClick={() => linkNavigate(1)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
            <span>Dashboard</span>
          </button>

          <button className="dashboard-nav-item active" onClick={() => linkNavigate(2)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span>Profile</span>
          </button>

          <button className="dashboard-nav-item" onClick={() => linkNavigate(3)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <span>Students</span>
          </button>

          <button className="dashboard-nav-item" onClick={() => linkNavigate(4)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <span>Feeding Program</span>
          </button>

          <button className="dashboard-nav-item dashboard-nav-logout" onClick={handleLogout}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"
              />
            </svg>
            <span>Logout</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="profile-main">
        {/* Top Header */}
        <header className="profile-header">
          <div className="profile-header-left">
            <h1>Profile</h1>
          </div>
          <div className="profile-header-right">
            <div className="profile-teacher-info">
              {profileImage ? (
                <img
                  src={profileImage}
                  alt="Teacher"
                  className="profile-teacher-avatar-img"
                />
              ) : (
                <div className="profile-teacher-avatar">{getInitials()}</div>
              )}
              <span className="profile-teacher-name">
                {formData.firstName} {formData.lastName}
              </span>
            </div>
          </div>
        </header>

        {/* Profile Content */}
        <div className="profile-content">
          {/* Two Column Grid */}
          <div className="profile-grid">
            {/* Left Column */}
            <div className="profile-column-left">
              {/* Personal Information Card */}
              <div className="profile-card">
                <div className="profile-card-header">
                  <div className="profile-card-header-icon">
                    <svg
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2>Personal Information</h2>
                    <p>Update your personal details and contact information</p>
                  </div>
                </div>

                <div className="profile-form">
                  <div className="profile-form-row">
                    <div className="profile-form-field">
                      <label className="profile-form-label required">
                        First Name
                      </label>
                      <input
                        type="text"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        className={`profile-form-input ${
                          formErrors.firstName ? "error" : ""
                        }`}
                        placeholder="Enter first name"
                        maxLength={25}
                      />
                      {formErrors.firstName && (
                        <span className="profile-form-error">
                          {formErrors.firstName}
                        </span>
                      )}
                    </div>

                    <div className="profile-form-field">
                      <label className="profile-form-label required">
                        Middle Name
                      </label>
                      <input
                        type="text"
                        name="middleName"
                        value={formData.middleName}
                        onChange={handleInputChange}
                        className={`profile-form-input ${
                          formErrors.middleName ? "error" : ""
                        }`}
                        placeholder="Enter last name"
                        maxLength={25}
                      />
                      {formErrors.middleName && (
                        <span className="profile-form-error">
                          {formErrors.middleName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="profile-form-field is-disabled">
                    <label className="profile-form-label required">
                      Last Name
                    </label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className={`profile-form-input ${
                        formErrors.schoolName ? "error" : ""
                      }`}
                      placeholder="Enter last name"
                      disabled
                    />
                    {formErrors.lastName && (
                      <span className="profile-form-error">
                        {formErrors.lastName}
                      </span>
                    )}
                  </div>
                  
                  <div className="profile-form-field is-disabled">
                    <label className="profile-form-label required">
                      School Name
                    </label>
                    <input
                      type="text"
                      name="schoolName"
                      value={formData.schoolName}
                      onChange={handleInputChange}
                      className={`profile-form-input ${
                        formErrors.schoolName ? "error" : ""
                      }`}
                      placeholder="Enter school name"
                      disabled
                    />
                    {formErrors.schoolName && (
                      <span className="profile-form-error">
                        {formErrors.schoolName}
                      </span>
                    )}
                  </div>

                  <div className="profile-form-field is-disabled">
                    <label className="profile-form-label required">
                      Email Address
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className={`profile-form-input ${
                        formErrors.email ? "error" : ""
                      }`}
                      placeholder="Enter email address"
                      disabled
                    />
                    {formErrors.email && (
                      <span className="profile-form-error">
                        {formErrors.email}
                      </span>
                    )}
                  </div>

                  <div className="profile-form-field">
                    <label className="profile-form-label required">
                      Mobile Number
                    </label>
                    <input
                      type="text"
                      name="mobile"
                      value={formData.mobile}
                      onChange={handleInputChange}
                      className={`profile-form-input ${
                        formErrors.mobile ? "error" : ""
                      }`}
                      placeholder="Enter mobile number"
                      maxLength={11}
                      inputMode="numeric"
                    />
                    {formErrors.mobile && (
                      <span className="profile-form-error">
                        {formErrors.mobile}
                      </span>
                    )}
                  </div>

                 
                </div>

                <div className="profile-form-actions">
                  <button
                    className="profile-button-secondary"
                    onClick={handleCancel}
                    disabled={!isEdited}
                  >
                    Cancel
                  </button>
                  <button
                    className="profile-button-primary"
                    onClick={handleSaveChanges}
                    disabled={!isEdited || isSavingProfile}
                  >
                    {isSavingProfile ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>

              {/* Assigned Sections Card */}
              <div className="profile-card">
                <div className="profile-card-header">
                  <div className="profile-card-header-icon">
                    <svg
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2>Assigned Sections</h2>
                    <p>Classes you are currently managing</p>
                  </div>
                </div>

                <div className="profile-sections-list">
                  {sections.length === 0 ? (
                    <div className="profile-section-item">
                      <div className="profile-section-info">
                        <h3>No sections assigned</h3>
                        <p>No data</p>
                      </div>
                    </div>
                  ) : (
                    sections.map((section) => (
                      <div key={section.id} className="profile-section-item">
                        <div className="profile-section-icon">
                          <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                            />
                          </svg>
                        </div>
                        <div className="profile-section-info">
                          <h3>{section.name}</h3>
                          <p>{section.grade || "No grade level"}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="profile-helper-text">
                  <svg
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>
                    You can only manage sections assigned to your account.
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="profile-column-right">
              {/* Profile Photo Card */}
              <div className="profile-card">
                <div className="profile-card-header">
                  <div className="profile-card-header-icon">
                    <svg
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2>Profile Photo</h2>
                    <p>Upload and manage your profile picture</p>
                  </div>
                </div>

                <div className="profile-photo-preview">
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt="Profile"
                      className="profile-photo-img"
                    />
                  ) : (
                    <div className="profile-photo-placeholder">
                      {getInitials()}
                    </div>
                  )}
                </div>

                <div className="profile-photo-actions">
                  <input
                    type="file"
                    id="profile-photo-input"
                    className="profile-photo-input"
                    accept="image/jpeg,image/jpg,image/png"
                    onChange={handleFileUpload}
                  />
                  <label
                    htmlFor="profile-photo-input"
                    className="profile-button-primary"
                  >
                    <svg
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    Upload Photo
                  </label>
                  {profileImage && (
                    <button
                      className="profile-button-text"
                      onClick={handleRemovePhoto}
                    >
                      Remove Photo
                    </button>
                  )}
                </div>

                <div className="profile-helper-text">
                  <svg
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>
                    Supported formats: JPG, JPEG, PNG. Max size: 5MB
                  </span>
                </div>
              </div>

              {/* Account Info Card */}
              <div className="profile-card">
                <div className="profile-card-header">
                  <div className="profile-card-header-icon">
                    <svg
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2>Account Information</h2>
                    <p>Your account details and access information</p>
                  </div>
                </div>

                <div className="profile-account-info">
                  <div className="profile-info-item">
                    <div className="profile-info-label">Teacher ID</div>
                    <div className="profile-info-value">
                      {accountInfo.teacherId}
                    </div>
                  </div>
                  <div className="profile-info-item">
                    <div className="profile-info-label">Role</div>
                    <div className="profile-info-value">
                      <span className="profile-role-badge">
                        {accountInfo.role}
                      </span>
                    </div>
                  </div>
                  <div className="profile-info-item">
                    <div className="profile-info-label">Date Joined</div>
                    <div className="profile-info-value">
                      {accountInfo.dateJoined}
                    </div>
                  </div>
                  <div className="profile-info-item">
                    <div className="profile-info-label">Last Login</div>
                    <div className="profile-info-value">
                      {accountInfo.lastLogin}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Image Cropper Modal */}
      {showCropper && (
        <div className="profile-modal-overlay">
          <div className="profile-modal">
            <div className="profile-modal-header">
              <h3>Crop Profile Photo</h3>
              <button
                className="profile-modal-close"
                onClick={cancelCropping}
              >
                <svg
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="profile-modal-body">
              <div className="profile-crop-container">
                <Cropper
                  image={imageToCrop}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
              <div className="profile-crop-controls">
                <label className="profile-crop-label">Zoom</label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="profile-crop-slider"
                />
              </div>
            </div>
            <div className="profile-modal-footer">
              <button
                className="profile-button-secondary"
                onClick={cancelCropping}
              >
                Cancel
              </button>
              <button
                className="profile-button-primary"
                onClick={createCroppedImage}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {showToast && (
        <div className="profile-toast">
          <svg
            className="profile-toast-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="profile-toast-content">
            <h3 className="profile-toast-title">Success!</h3>
            <p className="profile-toast-message">{toastMessage}</p>
          </div>
          <button
            className="profile-toast-close"
            onClick={() => setShowToast(false)}
            type="button"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// Helper function to create cropped image
const getCroppedImg = (imageSrc, pixelCrop) => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas is empty"));
          return;
        }
        const fileUrl = URL.createObjectURL(blob);
        resolve(fileUrl);
      }, "image/jpeg");
    };
    image.onerror = () => {
      reject(new Error("Failed to load image"));
    };
  });
};
