import React, { useCallback, useEffect, useRef, useState } from 'react'
// Token-aware axios: attaches the login token and renews it when it expires (see ../api.js)
import { authAxios as axios } from "../api";
import { buildCsv, buildExportCsvFilename, downloadCsv } from "../utils/csv";

// STYLES
// The shared admin pieces (.admin-btn, .admin-modal, .admin-form-field, .admin-toast, ...) are in AdminSchoolsStyle.css;
// .admin-note and .admin-password-input come from AdminAccountsStyle.css.
import "../styles/AdminSchoolsStyle.css";
import "../styles/AdminAccountsStyle.css";
import "../styles/AdminSettingsStyle.css";

// COMPONENTS
import AdminLayout from '../components/AdminLayout';

// ==============================
// Limits mirror the backend (server/admin.py and server/admin_settings.py).
// The server validates again and has the final say.
// ==============================
const NAME_MAX_LENGTH = 255;
const EMAIL_MAX_LENGTH = 255;
const CONTACT_NUMBER_MAX_LENGTH = 50;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 255;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CONTACT_NUMBER_PATTERN = /^[0-9+\-() ]+$/;

const TABS = [
    { key: "data", label: "Data" },
    { key: "account", label: "My Account" },
    { key: "classification", label: "Classification Reference" },
];

// Export datasets, in display order. The columns and rows come from the server (EXPORT_DATASETS in admin_settings.py).
const DATASETS = [
    {
        value: "students",
        label: "Students",
        description: "One row per student: name, sex, birthday, age, school, section, handler, latest BMI and Height-for-Age status, and last assessment date.",
    },
    {
        value: "bmi_history",
        label: "BMI history",
        description: "One row per measurement: student, school, date, weight, height, BMI, BMI status and Height-for-Age status.",
        usesDates: true,
    },
    {
        value: "schools",
        label: "Schools",
        description: "One row per school: details, status, and teacher and student counts.",
    },
    {
        value: "accounts",
        label: "Accounts",
        description: "One row per teacher account: name, email, role, school, status, date created and last login. Passwords are never included.",
    },
];

const ALL_SCHOOLS_LABEL = "All schools";

// Shown before every export, whatever the dataset
const EXPORT_PRIVACY_NOTE =
    "This file contains learners' personal and health information. Keep it in a safe place, share it only with people who are allowed to see it, and delete it when it is no longer needed.";

// "2026-10-06" -> "Oct 6, 2026"
const formatDate = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
    if (!match) {
        return "";
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
};

// 3 -> "3 rows", 1 -> "1 row"
const countLabel = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const Icon = ({ paths }) => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        {paths.map((d) => (
            <path key={d} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
        ))}
    </svg>
);

const ICONS = {
    close: ["M6 18L18 6M6 6l12 12"],
    download: ["M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"],
    view: ["M15 12a3 3 0 11-6 0 3 3 0 016 0z", "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"],
    hide: ["M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"],
};

// Password input with an eye button. What is typed is hidden until the eye is used.
const PasswordField = ({ id, label, value, onChange, error, autoComplete, hint }) => {
    const [visible, setVisible] = useState(false);
    const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

    return (
        <div className="admin-form-field">
            <label htmlFor={id} className="required">{label}</label>
            <div className="admin-password-input">
                <input
                    id={id}
                    type={visible ? "text" : "password"}
                    value={value}
                    maxLength={PASSWORD_MAX_LENGTH}
                    autoComplete={autoComplete}
                    onChange={(e) => onChange(e.target.value)}
                    className={error ? "error" : ""}
                    aria-invalid={Boolean(error)}
                    aria-describedby={describedBy}
                />
                <button
                    type="button"
                    className="admin-icon-btn"
                    aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                    aria-pressed={visible}
                    title={visible ? "Hide password" : "Show password"}
                    onClick={() => setVisible((prev) => !prev)}
                >
                    <Icon paths={visible ? ICONS.hide : ICONS.view} />
                </button>
            </div>
            {error
                ? <span id={`${id}-error`} className="admin-form-error">{error}</span>
                : hint ? <span id={`${id}-hint`} className="admin-form-hint">{hint}</span> : null}
        </div>
    );
};

// ==============================
// TAB: Data (CSV export)
// ==============================
function DataTab({ showToast }) {
    const [schools, setSchools] = useState([]);
    const [dataset, setDataset] = useState(DATASETS[0].value);
    const [schoolId, setSchoolId] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [errors, setErrors] = useState({});
    const [isReviewing, setIsReviewing] = useState(false);
    // Summary shown before the file is downloaded (null = closed): the server's preview answer
    const [summary, setSummary] = useState(null);
    const [isDownloading, setIsDownloading] = useState(false);

    const selected = DATASETS.find((item) => item.value === dataset) || DATASETS[0];

    // Every school, archived ones included: their records can be exported too
    useEffect(() => {
        axios
            .get("/api/admin/schools")
            .then((response) => {
                setSchools(Array.isArray(response.data?.schools) ? response.data.schools : []);
            })
            .catch((error) => {
                console.error("Fetching schools error:", error);
            });
    }, []);

    const exportParams = () => ({
        schoolId: schoolId || undefined,
        dateFrom: selected.usesDates && dateFrom ? dateFrom : undefined,
        dateTo: selected.usesDates && dateTo ? dateTo : undefined,
    });

    const handleReview = (e) => {
        e.preventDefault();
        if (isReviewing) {
            return;
        }
        if (selected.usesDates && dateFrom && dateTo && dateFrom > dateTo) {
            setErrors({ dateTo: "To can't be earlier than From." });
            return;
        }

        setErrors({});
        setIsReviewing(true);
        axios
            .get(`/api/admin/exports/${dataset}`, { params: { ...exportParams(), preview: 1 } })
            .then((response) => {
                const data = response.data;
                if (!data?.status) {
                    setErrors(data?.errors || {});
                    showToast("error", data?.message || "The export could not be prepared. Try again.");
                    return;
                }
                setSummary(data);
            })
            .catch((error) => {
                console.error("Export preview error:", error);
                showToast("error", "The export could not be prepared. Check your connection and try again.");
            })
            .finally(() => {
                setIsReviewing(false);
            });
    };

    const closeSummary = useCallback(() => {
        if (!isDownloading) {
            setSummary(null);
        }
    }, [isDownloading]);

    const handleDownload = () => {
        if (!summary || isDownloading) {
            return;
        }

        setIsDownloading(true);
        axios
            .get(`/api/admin/exports/${dataset}`, { params: exportParams() })
            .then((response) => {
                const data = response.data;
                if (!data?.status || !Array.isArray(data.rows)) {
                    showToast("error", data?.message || "The export failed. Try again.");
                    return;
                }
                const scope = data.filters?.school_name || ALL_SCHOOLS_LABEL;
                downloadCsv(buildExportCsvFilename(dataset, scope), buildCsv(data.columns, data.rows));
                showToast("success", `${data.label} exported: ${countLabel(data.rows.length, "row")}.`);
                setSummary(null);
            })
            .catch((error) => {
                console.error("Export error:", error);
                showToast("error", "The export failed. Check your connection and try again.");
            })
            .finally(() => {
                setIsDownloading(false);
            });
    };

    // Escape closes the summary
    useEffect(() => {
        if (!summary) {
            return;
        }
        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                closeSummary();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [summary, closeSummary]);

    const summaryDateRange = summary
        ? summary.filters?.date_from || summary.filters?.date_to
            ? `${formatDate(summary.filters.date_from) || "The beginning"} to ${formatDate(summary.filters.date_to) || "today"}`
            : "All dates"
        : "";

    return (
        <>
            <section className="admin-card admin-settings-panel" aria-labelledby="settings-export-title">
                <h2 id="settings-export-title">Export data (CSV)</h2>
                <p className="admin-settings-intro">
                    Download a spreadsheet file of the records in the system. You will see a summary before anything is downloaded.
                </p>

                <form onSubmit={handleReview} noValidate>
                    <div className="admin-form-grid admin-settings-form">
                        <div className="admin-form-field full">
                            <label htmlFor="export-dataset">Dataset</label>
                            <select id="export-dataset" value={dataset} onChange={(e) => { setDataset(e.target.value); setErrors({}); }} aria-describedby="export-dataset-hint">
                                {DATASETS.map((item) => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>
                            <span id="export-dataset-hint" className="admin-form-hint">{selected.description}</span>
                        </div>

                        <div className="admin-form-field full">
                            <label htmlFor="export-school">School</label>
                            <select
                                id="export-school"
                                value={schoolId}
                                onChange={(e) => { setSchoolId(e.target.value); setErrors((prev) => ({ ...prev, schoolId: "" })); }}
                                className={errors.schoolId ? "error" : ""}
                                aria-invalid={Boolean(errors.schoolId)}
                            >
                                <option value="">{ALL_SCHOOLS_LABEL}</option>
                                {schools.map((school) => (
                                    <option key={school.school_id} value={String(school.school_id)}>
                                        {school.school_name}{school.is_active ? "" : " (archived)"}
                                    </option>
                                ))}
                            </select>
                            {errors.schoolId ? <span className="admin-form-error">{errors.schoolId}</span> : null}
                        </div>

                        {/* The date range applies to the BMI history only */}
                        {selected.usesDates ? (
                            <>
                                <div className="admin-form-field">
                                    <label htmlFor="export-date-from">Measured from</label>
                                    <input
                                        id="export-date-from"
                                        type="date"
                                        value={dateFrom}
                                        max={dateTo || undefined}
                                        onChange={(e) => { setDateFrom(e.target.value); setErrors((prev) => ({ ...prev, dateFrom: "", dateTo: "" })); }}
                                        className={errors.dateFrom ? "error" : ""}
                                        aria-invalid={Boolean(errors.dateFrom)}
                                    />
                                    {errors.dateFrom
                                        ? <span className="admin-form-error">{errors.dateFrom}</span>
                                        : <span className="admin-form-hint">Leave empty to start from the first measurement.</span>}
                                </div>
                                <div className="admin-form-field">
                                    <label htmlFor="export-date-to">Measured to</label>
                                    <input
                                        id="export-date-to"
                                        type="date"
                                        value={dateTo}
                                        min={dateFrom || undefined}
                                        onChange={(e) => { setDateTo(e.target.value); setErrors((prev) => ({ ...prev, dateFrom: "", dateTo: "" })); }}
                                        className={errors.dateTo ? "error" : ""}
                                        aria-invalid={Boolean(errors.dateTo)}
                                    />
                                    {errors.dateTo
                                        ? <span className="admin-form-error">{errors.dateTo}</span>
                                        : <span className="admin-form-hint">Leave empty to include up to today.</span>}
                                </div>
                            </>
                        ) : null}
                    </div>

                    <div className="admin-settings-actions">
                        <button type="submit" className="admin-btn primary" disabled={isReviewing}>
                            {isReviewing ? "Preparing..." : "Review export"}
                        </button>
                    </div>
                </form>
            </section>

            <section className="admin-card admin-settings-panel" aria-labelledby="settings-retention-title">
                <h2 id="settings-retention-title">Activity Log retention</h2>
                <dl className="admin-detail-list">
                    <div>
                        <dt>How long activity records are kept</dt>
                        <dd>Keep forever</dd>
                    </div>
                </dl>
            </section>

            {/* Summary before the download */}
            {summary ? (
                <div className="admin-modal-overlay" onClick={closeSummary}>
                    <div className="admin-modal small" role="dialog" aria-modal="true" aria-labelledby="settings-export-summary-title" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h2 id="settings-export-summary-title">Export summary</h2>
                            <button type="button" className="admin-icon-btn" aria-label="Close" onClick={closeSummary}>
                                <Icon paths={ICONS.close} />
                            </button>
                        </div>
                        <div className="admin-modal-body">
                            <dl className="admin-detail-list admin-settings-summary">
                                <div><dt>Dataset</dt><dd>{summary.label}</dd></div>
                                <div><dt>School</dt><dd>{summary.filters?.school_name || ALL_SCHOOLS_LABEL}</dd></div>
                                {selected.usesDates ? <div><dt>Measurement dates</dt><dd>{summaryDateRange}</dd></div> : null}
                                <div><dt>Rows</dt><dd>{countLabel(summary.row_count, "row")}, {countLabel(summary.columns.length, "column")}</dd></div>
                            </dl>

                            <div className="admin-note admin-note-below" role="note">
                                {EXPORT_PRIVACY_NOTE}
                            </div>

                            {summary.row_count === 0 ? (
                                <p className="admin-settings-empty" role="status">There is nothing to export with these filters.</p>
                            ) : null}
                        </div>
                        <div className="admin-modal-actions">
                            <button type="button" className="admin-btn secondary" onClick={closeSummary} disabled={isDownloading}>
                                Cancel
                            </button>
                            <button type="button" className="admin-btn primary" onClick={handleDownload} disabled={isDownloading || summary.row_count === 0}>
                                <Icon paths={ICONS.download} />
                                {isDownloading ? "Downloading..." : "Download CSV"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

// ==============================
// TAB: My Account (the admin's own profile and password)
// ==============================
const EMPTY_PROFILE = { firstName: "", middleName: "", lastName: "", email: "", contactNumber: "" };
const EMPTY_PASSWORDS = { currentPassword: "", newPassword: "", confirmPassword: "" };

// Returns { field: message } for the profile form
const validateProfile = (form) => {
    const errors = {};
    const email = form.email.trim();
    const contactNumber = form.contactNumber.trim();

    [["firstName", "First name"], ["lastName", "Last name"]].forEach(([field, label]) => {
        const value = form[field].replace(/\s+/g, " ").trim();
        if (!value) {
            errors[field] = `${label} is required.`;
        } else if (!/[A-Za-z]/.test(value.normalize("NFKD"))) {
            errors[field] = `${label} must contain at least one letter.`;
        }
    });

    if (!email) {
        errors.email = "Email is required.";
    } else if (!EMAIL_PATTERN.test(email)) {
        errors.email = "Enter a valid email address.";
    }
    if (contactNumber && (!CONTACT_NUMBER_PATTERN.test(contactNumber) || !/\d/.test(contactNumber))) {
        errors.contactNumber = "Use digits, spaces and + - ( ) only.";
    }
    return errors;
};

// Returns { field: message } for the change-password form.
// Whether the current password is correct can only be checked by the server.
const validatePasswords = (form) => {
    const errors = {};
    if (!form.currentPassword) {
        errors.currentPassword = "Enter your current password.";
    }
    if (!form.newPassword) {
        errors.newPassword = "Enter a new password.";
    } else if (form.newPassword.length < PASSWORD_MIN_LENGTH) {
        errors.newPassword = `New password must have at least ${PASSWORD_MIN_LENGTH} characters.`;
    } else if (form.newPassword === form.currentPassword) {
        errors.newPassword = "New password must be different from the current password.";
    }
    if (!form.confirmPassword) {
        errors.confirmPassword = "Confirm the new password.";
    } else if (form.confirmPassword !== form.newPassword) {
        errors.confirmPassword = "New password and confirmation do not match.";
    }
    return errors;
};

function MyAccountTab({ showToast, onNameChange }) {
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [profile, setProfile] = useState(EMPTY_PROFILE);
    const [profileErrors, setProfileErrors] = useState({});
    const [profileMessage, setProfileMessage] = useState("");
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
    const [passwordErrors, setPasswordErrors] = useState({});
    const [passwordMessage, setPasswordMessage] = useState("");
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    // Remounts the password inputs after a change, which also hides them again
    const [passwordFormKey, setPasswordFormKey] = useState(0);

    const applyAccount = useCallback((account) => {
        setProfile({
            firstName: account.first_name || "",
            middleName: account.middle_name || "",
            lastName: account.last_name || "",
            email: account.email || "",
            contactNumber: account.mobile_no || "",
        });
    }, []);

    const loadAccount = useCallback(() => {
        setLoadError("");
        return axios
            .get("/api/admin/settings/account")
            .then((response) => {
                if (!response.data?.status) {
                    setLoadError(response.data?.message || "Your account could not be loaded.");
                    return;
                }
                applyAccount(response.data.account);
            })
            .catch((error) => {
                console.error("Fetching my account error:", error);
                setLoadError("Your account could not be loaded. Check your connection and try again.");
            })
            .finally(() => {
                setLoading(false);
            });
    }, [applyAccount]);

    useEffect(() => {
        loadAccount();
    }, [loadAccount]);

    const handleProfileChange = (field, value) => {
        setProfile((prev) => ({ ...prev, [field]: value }));
        setProfileErrors((prev) => ({ ...prev, [field]: "" }));
        setProfileMessage("");
    };

    const handleSaveProfile = (e) => {
        e.preventDefault();
        if (isSavingProfile) {
            return;
        }

        const errors = validateProfile(profile);
        setProfileErrors(errors);
        if (Object.keys(errors).length) {
            setProfileMessage("Please fix the highlighted fields.");
            return;
        }

        setIsSavingProfile(true);
        axios
            .put("/api/admin/settings/account", profile)
            .then((response) => {
                const data = response.data;
                if (!data?.status) {
                    // Duplicate or invalid values are reported per field by the server
                    setProfileErrors(data?.errors || {});
                    setProfileMessage(data?.message || "Your profile could not be saved. Try again.");
                    return;
                }
                applyAccount(data.account);
                setProfileMessage("");
                onNameChange(`${data.account.first_name} ${data.account.last_name}`);
                showToast("success", "Your profile was updated.");
            })
            .catch((error) => {
                console.error("Saving my account error:", error);
                setProfileMessage("Your profile could not be saved. Check your connection and try again.");
            })
            .finally(() => {
                setIsSavingProfile(false);
            });
    };

    const handlePasswordChange = (field, value) => {
        setPasswords((prev) => ({ ...prev, [field]: value }));
        setPasswordErrors((prev) => ({ ...prev, [field]: "" }));
        setPasswordMessage("");
    };

    const handleSavePassword = (e) => {
        e.preventDefault();
        if (isSavingPassword) {
            return;
        }

        const errors = validatePasswords(passwords);
        setPasswordErrors(errors);
        if (Object.keys(errors).length) {
            setPasswordMessage("Please fix the highlighted fields.");
            return;
        }

        setIsSavingPassword(true);
        // TODO(password hashing): the server stores and compares passwords as plain text for now
        // (see f_admin_change_my_password in server/admin_settings.py). Nothing changes on this page when it is hashed.
        axios
            .post("/api/admin/settings/password", passwords)
            .then((response) => {
                const data = response.data;
                if (!data?.status) {
                    setPasswordErrors(data?.errors || {});
                    setPasswordMessage(data?.message || "Your password could not be changed. Try again.");
                    return;
                }
                setPasswords(EMPTY_PASSWORDS);
                setPasswordErrors({});
                setPasswordMessage("");
                setPasswordFormKey((prev) => prev + 1);
                showToast("success", "Your password was changed. Use the new password the next time you log in.");
            })
            .catch((error) => {
                console.error("Changing my password error:", error);
                setPasswordMessage("Your password could not be changed. Check your connection and try again.");
            })
            .finally(() => {
                setIsSavingPassword(false);
            });
    };

    if (loading) {
        return <div className="admin-card"><div className="admin-state" role="status">Loading your account…</div></div>;
    }

    if (loadError) {
        return (
            <div className="admin-card">
                <div className="admin-state" role="alert">
                    <h3>Your account could not be loaded</h3>
                    <p>{loadError}</p>
                    <button type="button" className="admin-btn secondary" onClick={() => { setLoading(true); loadAccount(); }}>
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <section className="admin-card admin-settings-panel" aria-labelledby="settings-profile-title">
                <h2 id="settings-profile-title">Profile</h2>

                <form onSubmit={handleSaveProfile} noValidate>
                    {profileMessage ? <div className="admin-form-alert" role="alert">{profileMessage}</div> : null}

                    <div className="admin-form-grid admin-settings-form">
                        <div className="admin-form-field">
                            <label htmlFor="my-first-name" className="required">First name</label>
                            <input
                                id="my-first-name"
                                type="text"
                                value={profile.firstName}
                                maxLength={NAME_MAX_LENGTH}
                                autoComplete="given-name"
                                onChange={(e) => handleProfileChange("firstName", e.target.value)}
                                className={profileErrors.firstName ? "error" : ""}
                                aria-invalid={Boolean(profileErrors.firstName)}
                                aria-describedby={profileErrors.firstName ? "my-first-name-error" : undefined}
                            />
                            {profileErrors.firstName ? <span id="my-first-name-error" className="admin-form-error">{profileErrors.firstName}</span> : null}
                        </div>

                        <div className="admin-form-field">
                            <label htmlFor="my-middle-name">Middle name</label>
                            <input
                                id="my-middle-name"
                                type="text"
                                value={profile.middleName}
                                maxLength={NAME_MAX_LENGTH}
                                autoComplete="additional-name"
                                onChange={(e) => handleProfileChange("middleName", e.target.value)}
                                className={profileErrors.middleName ? "error" : ""}
                                aria-invalid={Boolean(profileErrors.middleName)}
                                placeholder="Optional"
                            />
                            {profileErrors.middleName ? <span className="admin-form-error">{profileErrors.middleName}</span> : null}
                        </div>

                        <div className="admin-form-field full">
                            <label htmlFor="my-last-name" className="required">Last name</label>
                            <input
                                id="my-last-name"
                                type="text"
                                value={profile.lastName}
                                maxLength={NAME_MAX_LENGTH}
                                autoComplete="family-name"
                                onChange={(e) => handleProfileChange("lastName", e.target.value)}
                                className={profileErrors.lastName ? "error" : ""}
                                aria-invalid={Boolean(profileErrors.lastName)}
                                aria-describedby={profileErrors.lastName ? "my-last-name-error" : undefined}
                            />
                            {profileErrors.lastName ? <span id="my-last-name-error" className="admin-form-error">{profileErrors.lastName}</span> : null}
                        </div>

                        <div className="admin-form-field full">
                            <label htmlFor="my-email" className="required">Email</label>
                            <input
                                id="my-email"
                                type="email"
                                value={profile.email}
                                maxLength={EMAIL_MAX_LENGTH}
                                autoComplete="email"
                                onChange={(e) => handleProfileChange("email", e.target.value)}
                                className={profileErrors.email ? "error" : ""}
                                aria-invalid={Boolean(profileErrors.email)}
                                aria-describedby={profileErrors.email ? "my-email-error" : "my-email-hint"}
                            />
                            {profileErrors.email
                                ? <span id="my-email-error" className="admin-form-error">{profileErrors.email}</span>
                                : <span id="my-email-hint" className="admin-form-hint">Used to log in. Must be unique.</span>}
                        </div>

                        <div className="admin-form-field">
                            <label htmlFor="my-contact-number">Contact number</label>
                            <input
                                id="my-contact-number"
                                type="tel"
                                value={profile.contactNumber}
                                maxLength={CONTACT_NUMBER_MAX_LENGTH}
                                autoComplete="tel"
                                onChange={(e) => handleProfileChange("contactNumber", e.target.value)}
                                className={profileErrors.contactNumber ? "error" : ""}
                                aria-invalid={Boolean(profileErrors.contactNumber)}
                                aria-describedby={profileErrors.contactNumber ? "my-contact-number-error" : undefined}
                                placeholder="Optional"
                            />
                            {profileErrors.contactNumber ? <span id="my-contact-number-error" className="admin-form-error">{profileErrors.contactNumber}</span> : null}
                        </div>

                        <div className="admin-form-field">
                            <label htmlFor="my-role">Role</label>
                            <input id="my-role" type="text" value="Admin" readOnly />
                        </div>
                    </div>

                    <div className="admin-settings-actions">
                        <button type="submit" className="admin-btn primary" disabled={isSavingProfile}>
                            {isSavingProfile ? "Saving..." : "Save Profile"}
                        </button>
                    </div>
                </form>
            </section>

            <section className="admin-card admin-settings-panel" aria-labelledby="settings-password-title">
                <h2 id="settings-password-title">Change password</h2>

                {/* The stored password is never fetched or shown: only what is typed here can be revealed with the eye icon */}
                <form onSubmit={handleSavePassword} noValidate key={passwordFormKey}>
                    {passwordMessage ? <div className="admin-form-alert" role="alert">{passwordMessage}</div> : null}

                    <div className="admin-settings-form admin-settings-stack">
                        <PasswordField
                            id="my-current-password"
                            label="Current password"
                            value={passwords.currentPassword}
                            onChange={(value) => handlePasswordChange("currentPassword", value)}
                            error={passwordErrors.currentPassword}
                            autoComplete="current-password"
                        />
                        <PasswordField
                            id="my-new-password"
                            label="New password"
                            value={passwords.newPassword}
                            onChange={(value) => handlePasswordChange("newPassword", value)}
                            error={passwordErrors.newPassword}
                            autoComplete="new-password"
                            hint={`At least ${PASSWORD_MIN_LENGTH} characters, and different from the current password.`}
                        />
                        <PasswordField
                            id="my-confirm-password"
                            label="Confirm new password"
                            value={passwords.confirmPassword}
                            onChange={(value) => handlePasswordChange("confirmPassword", value)}
                            error={passwordErrors.confirmPassword}
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="admin-settings-actions">
                        <button type="submit" className="admin-btn primary" disabled={isSavingPassword}>
                            {isSavingPassword ? "Saving..." : "Change Password"}
                        </button>
                    </div>
                </form>
            </section>
        </>
    );
}

// ==============================
// TAB: Classification Reference (read-only)
// ==============================
function ClassificationTab() {
    // The labels and the age range come from the server, which reads them from the classification code
    // (server/growth.py), so this page always matches how students are actually classified.
    const [reference, setReference] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const loadReference = useCallback(() => {
        setLoadError("");
        return axios
            .get("/api/admin/settings/classification")
            .then((response) => {
                if (!response.data?.status) {
                    setLoadError(response.data?.message || "The classification reference could not be loaded.");
                    return;
                }
                setReference(response.data.reference);
            })
            .catch((error) => {
                console.error("Fetching classification reference error:", error);
                setLoadError("The classification reference could not be loaded. Check your connection and try again.");
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        loadReference();
    }, [loadReference]);

    if (loading) {
        return <div className="admin-card"><div className="admin-state" role="status">Loading the classification reference…</div></div>;
    }

    if (loadError || !reference) {
        return (
            <div className="admin-card">
                <div className="admin-state" role="alert">
                    <h3>The classification reference could not be loaded</h3>
                    <p>{loadError}</p>
                    <button type="button" className="admin-btn secondary" onClick={() => { setLoading(true); loadReference(); }}>
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    const renderLabels = (labels) => (
        <ul className="admin-settings-labels">
            {labels.map((label) => (
                <li key={label}>{label}</li>
            ))}
        </ul>
    );

    return (
        <section className="admin-card admin-settings-panel" aria-labelledby="settings-classification-title">
            <h2 id="settings-classification-title">How students are classified</h2>
            <p className="admin-settings-intro">For reference only. Nothing on this page can be changed.</p>

            <dl className="admin-settings-reference">
                <div>
                    <dt>Standard</dt>
                    <dd>
                        WHO Growth Reference (BMI-for-Age and Height-for-Age), with DepEd status labels. Weight-for-Age is not used.
                    </dd>
                </div>
                <div>
                    <dt>BMI formula</dt>
                    <dd>BMI = weight (kg) ÷ height (m)²</dd>
                </div>
                <div>
                    <dt>BMI-for-Age labels</dt>
                    <dd>{renderLabels(reference.bmi_labels)}</dd>
                </div>
                <div>
                    <dt>Height-for-Age labels</dt>
                    <dd>{renderLabels(reference.hfa_labels)}</dd>
                </div>
                <div>
                    <dt>Age</dt>
                    <dd>
                        Computed from the student's birthday on the day of each measurement. The WHO reference covers ages{" "}
                        {reference.who_min_age} to {reference.who_max_age}. Students outside that range are classified with the regular
                        BMI cut-offs and get no Height-for-Age status.
                    </dd>
                </div>
                <div>
                    <dt>At-Risk</dt>
                    <dd>A student is At-Risk when their latest BMI status is anything other than {reference.normal_label}.</dd>
                </div>
            </dl>
        </section>
    );
}

// ==============================
// PAGE
// ==============================
function AdminSettings() {
    const [activeTab, setActiveTab] = useState(TABS[0].key);
    // Name shown in the page header after the profile is saved (null = the name the layout loaded)
    const [signedInAs, setSignedInAs] = useState(null);

    // Toast
    const [toast, setToast] = useState(null); // { type: "success" | "error", message }
    const toastTimerRef = useRef(null);

    const showToast = useCallback((type, message) => {
        clearTimeout(toastTimerRef.current);
        setToast({ type, message });
        toastTimerRef.current = setTimeout(() => setToast(null), type === "error" ? 6000 : 3500);
    }, []);

    useEffect(() => () => clearTimeout(toastTimerRef.current), []);

    return (
        <AdminLayout active="settings" title="Settings" documentTitle="Feeding Program | Settings" signedInAs={signedInAs}>
            <div className="admin-toolbar">
                <div className="admin-filter-group admin-settings-tabs" role="tablist" aria-label="Settings sections">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            role="tab"
                            id={`settings-tab-${tab.key}`}
                            aria-selected={activeTab === tab.key}
                            aria-controls={`settings-panel-${tab.key}`}
                            className={`admin-filter-btn ${activeTab === tab.key ? "active" : ""}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div role="tabpanel" id={`settings-panel-${activeTab}`} aria-labelledby={`settings-tab-${activeTab}`} className="admin-settings-panels">
                {activeTab === "data" ? <DataTab showToast={showToast} /> : null}
                {activeTab === "account" ? <MyAccountTab showToast={showToast} onNameChange={setSignedInAs} /> : null}
                {activeTab === "classification" ? <ClassificationTab /> : null}
            </div>

            {/* Toast */}
            {toast ? (
                <div className={`admin-toast ${toast.type}`} role={toast.type === "error" ? "alert" : "status"}>
                    <span>{toast.message}</span>
                    <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>
                        <Icon paths={ICONS.close} />
                    </button>
                </div>
            ) : null}
        </AdminLayout>
    )
}

export default AdminSettings
