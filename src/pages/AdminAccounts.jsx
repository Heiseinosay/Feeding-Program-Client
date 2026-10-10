import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from "react-router";
// Token-aware axios: attaches the login token and renews it when it expires (see ../api.js)
import { authAxios as axios } from "../api";

// STYLES
// The shared admin pieces (.admin-btn, .admin-table, .admin-modal, .admin-toast, ...) are in AdminSchoolsStyle.css
import "../styles/AdminSchoolsStyle.css";
import "../styles/AdminAccountsStyle.css";

// COMPONENTS
import AdminLayout from '../components/AdminLayout';

// ==============================
// Limits mirror the backend (server/admin.py). The server validates again and has the final say.
// ==============================
const NAME_MAX_LENGTH = 255;
const EMAIL_MAX_LENGTH = 255;
const CONTACT_NUMBER_MAX_LENGTH = 50;
const PAGE_SIZE = 10;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CONTACT_NUMBER_PATTERN = /^[0-9+\-() ]+$/;

const STATUS_FILTERS = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "deactivated", label: "Deactivated" },
];

// School filter values that are not a school id
const SCHOOL_FILTER_ALL = "all";
const SCHOOL_FILTER_NONE = "none";

// Table columns, in display order
const COLUMNS = [
    { key: "full_name", label: "Full name" },
    { key: "email", label: "Email" },
    { key: "role", label: "Role" },
    { key: "school_name", label: "School" },
    { key: "is_active", label: "Status" },
    { key: "last_login_at", label: "Last login" },
    { key: "created_at", label: "Date created" },
];

const EMPTY_FORM = {
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    schoolId: "",
    contactNumber: "",
};

// This page lists TEACHER accounts only. The admin account is never returned by /api/admin/accounts:
// the admin manages their own details in Settings > My Account (see AdminSettings.jsx).

// Why Delete is not offered for an account (shown as a tooltip and when the button is used)
const ACTIVE_DELETE_REASON = "Deactivate this account first. Only deactivated accounts can be deleted.";

// Search key: ignores case, extra spaces and accents
const toSearchKey = (value) =>
    String(value ?? "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

// "2026-10-03T18:52:00" -> Date in the browser's time zone (null if it can't be read)
const parseDateTime = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(value ?? ""));
    if (!match) {
        return null;
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0));
};

// "2026-10-03T18:52:00" -> "Oct 3, 2026"
const formatDate = (value) => {
    const date = parseDateTime(value);
    return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
};

// "2026-10-03T18:52:00" -> "Oct 3, 2026, 6:52 PM"
const formatDateTime = (value) => {
    const date = parseDateTime(value);
    return date
        ? date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
        : "";
};

// Every account on this page is a teacher
const ROLE_LABEL = "Teacher";

// 3 -> "3 students", 1 -> "1 student"
const countLabel = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

// DEFAULT PASSWORD (preview only: the server builds the real one, see build_default_password in server/admin.py)
// FirstName_LastName_mmddyy. Accents are removed and everything that is not a letter is dropped:
//   Juan Dela Cruz, 5 Oct 2026   -> Juan_DelaCruz_100526
//   Ma. Theresa Peña, 5 Oct 2026 -> MaTheresa_Pena_100526
const toPasswordNamePart = (name) => String(name ?? "").normalize("NFKD").replace(/[^A-Za-z]/g, "");

// Returns "" until both names have at least one letter
const buildDefaultPassword = (firstName, lastName, onDate) => {
    const first = toPasswordNamePart(firstName);
    const last = toPasswordNamePart(lastName);
    if (!first || !last) {
        return "";
    }
    const twoDigits = (number) => String(number).padStart(2, "0");
    return `${first}_${last}_${twoDigits(onDate.getMonth() + 1)}${twoDigits(onDate.getDate())}${twoDigits(onDate.getFullYear() % 100)}`;
};

// Empty values always sort last, whatever the direction
const compareAccounts = (a, b, column, direction) => {
    const left = a[column.key];
    const right = b[column.key];
    const leftEmpty = left === null || left === undefined || left === "";
    const rightEmpty = right === null || right === undefined || right === "";
    if (leftEmpty || rightEmpty) {
        return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
    }

    let result;
    if (typeof left === "boolean") {
        result = Number(left) - Number(right);
    } else {
        result = String(left).localeCompare(String(right), undefined, { sensitivity: "base", numeric: true });
    }
    return direction === "asc" ? result : -result;
};

// Returns { field: message } for the Add / Edit form
const validateAccountForm = (form) => {
    const errors = {};
    const email = form.email.trim();
    const contactNumber = form.contactNumber.trim();

    [["firstName", "First name"], ["lastName", "Last name"]].forEach(([field, label]) => {
        const value = form[field].replace(/\s+/g, " ").trim();
        if (!value) {
            errors[field] = `${label} is required.`;
        } else if (!toPasswordNamePart(value)) {
            errors[field] = `${label} must contain at least one letter.`;
        }
    });

    if (!email) {
        errors.email = "Email is required.";
    } else if (!EMAIL_PATTERN.test(email)) {
        errors.email = "Enter a valid email address.";
    }
    if (!form.schoolId) {
        errors.schoolId = "School is required.";
    }
    if (contactNumber && (!CONTACT_NUMBER_PATTERN.test(contactNumber) || !/\d/.test(contactNumber))) {
        errors.contactNumber = "Use digits, spaces and + - ( ) only.";
    }
    return errors;
};

const Icon = ({ paths }) => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        {paths.map((d) => (
            <path key={d} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
        ))}
    </svg>
);

const ICONS = {
    search: ["M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"],
    plus: ["M12 4v16m8-8H4"],
    close: ["M6 18L18 6M6 6l12 12"],
    view: ["M15 12a3 3 0 11-6 0 3 3 0 016 0z", "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"],
    hide: ["M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"],
    edit: ["M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"],
    key: ["M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"],
    deactivate: ["M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"],
    restore: ["M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"],
    delete: ["M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"],
    sort: ["M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"],
    sortAsc: ["M5 15l7-7 7 7"],
    sortDesc: ["M19 9l-7 7-7-7"],
};

function AdminAccounts() {
    const navigate = useNavigate()

    // Data
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    // Active schools, for the School field of the form
    const [schools, setSchools] = useState([]);

    // List controls
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [schoolFilter, setSchoolFilter] = useState(SCHOOL_FILTER_ALL);
    const [sortKey, setSortKey] = useState("full_name");
    const [sortDirection, setSortDirection] = useState("asc");
    const [page, setPage] = useState(1);

    // Account detail dialog (null = closed). The row is shown at once; the full account
    // (with the password) replaces it when the server answers.
    const [viewingAccount, setViewingAccount] = useState(null);
    const [viewLoading, setViewLoading] = useState(false);
    const [viewError, setViewError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const viewRequestRef = useRef(0);

    // Add / Edit form. editingAccount is null when adding.
    const [formOpen, setFormOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [formErrors, setFormErrors] = useState({});
    const [formMessage, setFormMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [showFormPassword, setShowFormPassword] = useState(false);

    // Deactivate / Reactivate confirmation
    const [confirmAction, setConfirmAction] = useState(null); // { type: "deactivate" | "reactivate", account }
    const [isConfirming, setIsConfirming] = useState(false);

    // Delete dialog (null = closed)
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [replacements, setReplacements] = useState([]);
    const [deleteSessionCount, setDeleteSessionCount] = useState(0);
    const [replacementsLoading, setReplacementsLoading] = useState(false);
    const [replacementsError, setReplacementsError] = useState("");
    const [replacementId, setReplacementId] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const deleteRequestRef = useRef(0);

    // Reset password dialog (null = closed). UI only for now.
    const [resetTarget, setResetTarget] = useState(null);
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [resetMessage, setResetMessage] = useState("");

    // Toast
    const [toast, setToast] = useState(null); // { type: "success" | "error", message }
    const toastTimerRef = useRef(null);

    const showToast = useCallback((type, message) => {
        clearTimeout(toastTimerRef.current);
        setToast({ type, message });
        toastTimerRef.current = setTimeout(() => setToast(null), type === "error" ? 6000 : 3500);
    }, []);

    useEffect(() => () => clearTimeout(toastTimerRef.current), []);

    // ==========================
    // Load
    // ==========================
    const loadAccounts = useCallback(() => {
        setLoadError("");
        return axios
            .get("/api/admin/accounts")
            .then((response) => {
                if (!response.data?.status) {
                    setLoadError(response.data?.message || "The accounts could not be loaded.");
                    return;
                }
                setAccounts(Array.isArray(response.data.accounts) ? response.data.accounts : []);
            })
            .catch((error) => {
                console.error("Fetching accounts error:", error);
                setLoadError("The accounts could not be loaded. Check your connection and try again.");
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    const loadSchools = useCallback(() => {
        return axios
            .get("/api/admin/schools")
            .then((response) => {
                const list = Array.isArray(response.data?.schools) ? response.data.schools : [];
                setSchools(list.filter((school) => school.is_active));
            })
            .catch((error) => {
                console.error("Fetching schools error:", error);
            });
    }, []);

    useEffect(() => {
        loadAccounts();
        loadSchools();
    }, [loadAccounts, loadSchools]);

    // ==========================
    // Derived list: filter -> search -> sort -> page
    // ==========================
    const statusCounts = useMemo(() => ({
        all: accounts.length,
        active: accounts.filter((account) => account.is_active).length,
        deactivated: accounts.filter((account) => !account.is_active).length,
    }), [accounts]);

    // Schools that have at least one account, for the school filter
    const schoolOptions = useMemo(() => {
        const byId = new Map();
        accounts.forEach((account) => {
            if (account.school_id !== null && account.school_id !== undefined) {
                byId.set(String(account.school_id), account.school_name || "");
            }
        });
        return [...byId.entries()]
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true }));
    }, [accounts]);

    // Teachers not linked to a school yet get their own filter option, only when there are any
    const hasUnlinkedTeachers = useMemo(
        () => accounts.some((account) => account.school_id === null || account.school_id === undefined),
        [accounts]
    );

    const visibleAccounts = useMemo(() => {
        const query = toSearchKey(searchQuery);
        const column = COLUMNS.find((item) => item.key === sortKey) || COLUMNS[0];

        return accounts
            .filter((account) => {
                if (statusFilter === "active" && !account.is_active) return false;
                if (statusFilter === "deactivated" && account.is_active) return false;

                if (schoolFilter === SCHOOL_FILTER_NONE) {
                    if (account.school_id !== null && account.school_id !== undefined) return false;
                } else if (schoolFilter !== SCHOOL_FILTER_ALL && String(account.school_id) !== schoolFilter) {
                    return false;
                }

                if (!query) return true;
                return toSearchKey(account.full_name).includes(query) || toSearchKey(account.email).includes(query);
            })
            .sort((a, b) => compareAccounts(a, b, column, sortDirection) || compareAccounts(a, b, COLUMNS[0], "asc"));
    }, [accounts, searchQuery, statusFilter, schoolFilter, sortKey, sortDirection]);

    const pageCount = Math.max(1, Math.ceil(visibleAccounts.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const pageStart = (currentPage - 1) * PAGE_SIZE;
    const pageAccounts = visibleAccounts.slice(pageStart, pageStart + PAGE_SIZE);

    // A new search, filter or sort starts again from the first page
    useEffect(() => {
        setPage(1);
    }, [searchQuery, statusFilter, schoolFilter, sortKey, sortDirection]);

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDirection("asc");
        }
    };

    const hasFilters = Boolean(searchQuery.trim()) || statusFilter !== "all" || schoolFilter !== SCHOOL_FILTER_ALL;

    const clearFilters = () => {
        setSearchQuery("");
        setStatusFilter("all");
        setSchoolFilter(SCHOOL_FILTER_ALL);
    };

    // ==========================
    // Account detail
    // ==========================
    const openView = (account) => {
        const requestId = viewRequestRef.current + 1;
        viewRequestRef.current = requestId;

        setViewingAccount(account);
        setShowPassword(false);
        setViewError("");
        setViewLoading(true);

        axios
            .get(`/api/admin/accounts/${account.account_id}`)
            .then((response) => {
                // Ignore the answer if the dialog was closed or another account was opened meanwhile
                if (viewRequestRef.current !== requestId) {
                    return;
                }
                if (!response.data?.status) {
                    setViewError(response.data?.message || "The account details could not be loaded.");
                    return;
                }
                setViewingAccount(response.data.account);
            })
            .catch((error) => {
                console.error("Fetching account error:", error);
                if (viewRequestRef.current === requestId) {
                    setViewError("The account details could not be loaded. Check your connection and try again.");
                }
            })
            .finally(() => {
                if (viewRequestRef.current === requestId) {
                    setViewLoading(false);
                }
            });
    };

    const closeView = useCallback(() => {
        viewRequestRef.current += 1;
        setViewingAccount(null);
        setShowPassword(false);
    }, []);

    // ==========================
    // Add / Edit
    // ==========================
    const openAddForm = () => {
        setEditingAccount(null);
        setForm(EMPTY_FORM);
        setFormErrors({});
        setFormMessage("");
        setShowFormPassword(false);
        setFormOpen(true);
        loadSchools();
    };

    const openEditForm = (account) => {
        closeView();
        setEditingAccount(account);
        setForm({
            firstName: account.first_name || "",
            middleName: account.middle_name || "",
            lastName: account.last_name || "",
            email: account.email || "",
            schoolId: account.school_id !== null && account.school_id !== undefined ? String(account.school_id) : "",
            contactNumber: account.mobile_no || "",
        });
        setFormErrors({});
        setFormMessage("");
        setFormOpen(true);
        loadSchools();
    };

    const closeForm = () => {
        if (isSaving) {
            return;
        }
        setFormOpen(false);
    };

    const handleFormChange = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setFormErrors((prev) => ({ ...prev, [field]: "" }));
        setFormMessage("");
    };

    // School choices of the form: the active schools, plus the teacher's own school if it is archived
    const formSchoolOptions = useMemo(() => {
        const options = schools.map((school) => ({ value: String(school.school_id), label: school.school_name }));
        const currentId = editingAccount?.school_id;
        if (currentId !== null && currentId !== undefined && !options.some((option) => option.value === String(currentId))) {
            options.push({ value: String(currentId), label: `${editingAccount.school_name || "Current school"} (archived)` });
        }
        return options;
    }, [schools, editingAccount]);

    const schoolChanged =
        Boolean(editingAccount) &&
        editingAccount.school_id !== null &&
        editingAccount.school_id !== undefined &&
        form.schoolId !== "" &&
        form.schoolId !== String(editingAccount.school_id);

    // Shown while adding: what the password will be if the account is created today
    const passwordPreview = buildDefaultPassword(form.firstName, form.lastName, new Date());

    const handleSaveAccount = (e) => {
        e.preventDefault();
        if (isSaving) {
            return;
        }

        const errors = validateAccountForm(form);
        setFormErrors(errors);
        if (Object.keys(errors).length) {
            setFormMessage("Please fix the highlighted fields.");
            return;
        }

        // The role and the password are never sent: the server decides both
        const payload = {
            firstName: form.firstName,
            middleName: form.middleName,
            lastName: form.lastName,
            email: form.email,
            schoolId: Number(form.schoolId),
            contactNumber: form.contactNumber,
        };

        setIsSaving(true);
        const request = editingAccount
            ? axios.put(`/api/admin/accounts/${editingAccount.account_id}`, payload)
            : axios.post("/api/admin/accounts", payload);

        request
            .then((response) => {
                const data = response.data;
                if (!data?.status) {
                    // Duplicate or invalid values are reported per field by the server
                    setFormErrors(data?.errors || {});
                    setFormMessage(data?.message || "The account could not be saved. Try again.");
                    return;
                }

                setFormOpen(false);
                if (editingAccount) {
                    showToast("success", `${data.account.full_name} was updated.`);
                } else {
                    showToast("success", `${data.account.full_name} was added. Give them their default password.`);
                    // Open the new account so the admin can read the password to hand over (no email is sent)
                    openView(data.account);
                }
                return loadAccounts();
            })
            .catch((error) => {
                console.error("Saving account error:", error);
                setFormMessage("The account could not be saved. Check your connection and try again.");
            })
            .finally(() => {
                setIsSaving(false);
            });
    };

    // ==========================
    // Deactivate / Reactivate
    // ==========================
    const requestDeactivateOrReactivate = (account) => {
        closeView();
        setConfirmAction({ type: account.is_active ? "deactivate" : "reactivate", account });
    };

    const closeConfirm = () => {
        if (isConfirming) {
            return;
        }
        setConfirmAction(null);
    };

    const handleConfirm = () => {
        if (!confirmAction || isConfirming) {
            return;
        }
        const { type, account } = confirmAction;

        setIsConfirming(true);
        axios
            .post(`/api/admin/accounts/${account.account_id}/${type}`)
            .then((response) => {
                if (!response.data?.status) {
                    showToast("error", response.data?.message || "Something went wrong. Try again.");
                    return;
                }
                showToast("success", `${account.full_name} was ${type === "deactivate" ? "deactivated" : "reactivated"}.`);
                setConfirmAction(null);
                return loadAccounts();
            })
            .catch((error) => {
                console.error("Account status error:", error);
                showToast("error", "Something went wrong. Check your connection and try again.");
            })
            .finally(() => {
                setIsConfirming(false);
            });
    };

    // ==========================
    // Delete (with a replacement teacher)
    // ==========================
    // Why Delete is not offered for this account, or "" when it is
    const deleteBlockedReason = (account) => {
        if (account.is_active) return ACTIVE_DELETE_REASON;
        return "";
    };

    const requestDelete = (account) => {
        const reason = deleteBlockedReason(account);
        if (reason) {
            showToast("error", reason);
            return;
        }

        const requestId = deleteRequestRef.current + 1;
        deleteRequestRef.current = requestId;

        closeView();
        setDeleteTarget(account);
        setReplacements([]);
        setDeleteSessionCount(0);
        setReplacementId("");
        setReplacementsError("");
        setReplacementsLoading(true);

        axios
            .get(`/api/admin/accounts/${account.account_id}/replacements`)
            .then((response) => {
                if (deleteRequestRef.current !== requestId) {
                    return;
                }
                if (!response.data?.status) {
                    setReplacementsError(response.data?.message || "The replacement teachers could not be loaded.");
                    return;
                }
                setReplacements(Array.isArray(response.data.replacements) ? response.data.replacements : []);
                setDeleteSessionCount(Number(response.data.session_count) || 0);
            })
            .catch((error) => {
                console.error("Fetching replacement teachers error:", error);
                if (deleteRequestRef.current === requestId) {
                    setReplacementsError("The replacement teachers could not be loaded. Check your connection and try again.");
                }
            })
            .finally(() => {
                if (deleteRequestRef.current === requestId) {
                    setReplacementsLoading(false);
                }
            });
    };

    const closeDelete = useCallback(() => {
        deleteRequestRef.current += 1;
        setDeleteTarget(null);
    }, []);

    const handleDelete = () => {
        // No replacement chosen: nothing is deleted
        if (!deleteTarget || !replacementId || isDeleting) {
            return;
        }
        const account = deleteTarget;

        setIsDeleting(true);
        axios
            .delete(`/api/admin/accounts/${account.account_id}`, { data: { replacementTeacherId: Number(replacementId) } })
            .then((response) => {
                const data = response.data;
                if (!data?.status) {
                    showToast("error", data?.message || "The account was not deleted. Try again.");
                    return;
                }
                const renamed = Array.isArray(data.renamedSections) ? data.renamedSections.length : 0;
                showToast(
                    "success",
                    `${account.full_name} was deleted. Their records now belong to ${data.replacement}.`
                        + (renamed ? ` ${countLabel(renamed, "section")} renamed with "(from transfer)".` : "")
                );
                closeDelete();
                return loadAccounts();
            })
            .catch((error) => {
                console.error("Deleting account error:", error);
                showToast("error", "The account was not deleted. Check your connection and try again.");
            })
            .finally(() => {
                setIsDeleting(false);
            });
    };

    // ==========================
    // Reset password (UI ONLY)
    // ==========================
    const openReset = (account) => {
        closeView();
        setResetTarget(account);
        setShowResetPassword(false);
        setResetMessage("");
    };

    const handleConfirmReset = () => {
        // TODO(reset password): connect the reset here. It needs a new admin-only endpoint
        // (e.g. POST /api/admin/accounts/<id>/reset_password) that builds the password on the server,
        // saves it and sets is_first_login = 1. Nothing is sent or saved for now.
        setResetMessage("Not available yet. Password reset will be connected in a later update.");
    };

    // Escape closes whichever dialog is open
    useEffect(() => {
        if (!formOpen && !viewingAccount && !confirmAction && !deleteTarget && !resetTarget) {
            return;
        }
        const handleKeyDown = (event) => {
            if (event.key !== "Escape") {
                return;
            }
            if (confirmAction) {
                if (!isConfirming) setConfirmAction(null);
            } else if (deleteTarget) {
                if (!isDeleting) closeDelete();
            } else if (resetTarget) {
                setResetTarget(null);
            } else if (formOpen) {
                if (!isSaving) setFormOpen(false);
            } else {
                closeView();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [formOpen, viewingAccount, confirmAction, deleteTarget, resetTarget, isConfirming, isDeleting, isSaving, closeDelete, closeView]);

    // ==========================
    // Render helpers
    // ==========================
    const renderStatus = (account) => (
        <span className={`admin-status-badge ${account.is_active ? "active" : "archived"}`}>
            {account.is_active ? "Active" : "Deactivated"}
        </span>
    );

    // An active teacher of an archived school cannot log in either: say so next to the status
    const isBlockedBySchool = (account) => account.is_active && account.school_is_active === false;

    const renderSchool = (account) => {
        if (!account.school_name) {
            return <span className="admin-muted">No school linked</span>;
        }
        return account.school_name;
    };

    const renderActions = (account) => {
        const statusAction = account.is_active ? "Deactivate" : "Reactivate";
        const deleteReason = deleteBlockedReason(account);

        return (
            <div className="admin-row-actions">
                <button type="button" className="admin-icon-btn" title="View" aria-label={`View ${account.full_name}`} onClick={() => openView(account)}>
                    <Icon paths={ICONS.view} />
                    <span>View</span>
                </button>
                <button type="button" className="admin-icon-btn" title="Edit" aria-label={`Edit ${account.full_name}`} onClick={() => openEditForm(account)}>
                    <Icon paths={ICONS.edit} />
                    <span>Edit</span>
                </button>
                <button type="button" className="admin-icon-btn" title="Reset password" aria-label={`Reset password of ${account.full_name}`} onClick={() => openReset(account)}>
                    <Icon paths={ICONS.key} />
                    <span>Reset password</span>
                </button>
                <button
                    type="button"
                    className="admin-icon-btn"
                    title={statusAction}
                    aria-label={`${statusAction} ${account.full_name}`}
                    onClick={() => requestDeactivateOrReactivate(account)}
                >
                    <Icon paths={account.is_active ? ICONS.deactivate : ICONS.restore} />
                    <span>{statusAction}</span>
                </button>
                {/* aria-disabled (not disabled) so the reason can be shown on hover and on tap */}
                <button
                    type="button"
                    className={`admin-icon-btn danger ${deleteReason ? "is-disabled" : ""}`}
                    title={deleteReason || "Delete"}
                    aria-label={`Delete ${account.full_name}`}
                    aria-disabled={Boolean(deleteReason)}
                    onClick={() => requestDelete(account)}
                >
                    <Icon paths={ICONS.delete} />
                    <span>Delete</span>
                </button>
            </div>
        );
    };

    const confirmCopy = confirmAction && {
        deactivate: {
            title: "Deactivate this account?",
            body: [
                `${confirmAction.account.full_name} will not be able to log in. If they are logged in now, they are signed out straight away.`,
                "Their students and sections will remain visible and counted in reports but cannot be edited until the account is reactivated or replaced.",
                "You can reactivate the account at any time.",
            ],
            button: "Deactivate account",
            tone: "warning",
        },
        reactivate: {
            title: "Reactivate this account?",
            body: [
                `${confirmAction.account.full_name} will be able to log in again with the same password.`,
                "Their students and sections can be edited again, with all data intact.",
                confirmAction.account.school_is_active === false
                    ? "Their school is archived, so they still cannot log in until the school is restored."
                    : null,
            ],
            button: "Reactivate account",
            tone: "primary",
        },
    }[confirmAction.type];

    const viewingOwnsRecords = Boolean(viewingAccount) && (viewingAccount.student_count > 0 || viewingAccount.section_count > 0);

    const noReplacementAvailable = Boolean(deleteTarget) && !replacementsLoading && !replacementsError && replacements.length === 0;

    // Shown in the Reset password dialog: the default format with today's date
    const resetPasswordPreview = resetTarget ? buildDefaultPassword(resetTarget.first_name, resetTarget.last_name, new Date()) : "";

    return (
        <AdminLayout active="accounts" title="Accounts" documentTitle="Feeding Program | Accounts">
            {/* Controls */}
            <div className="admin-toolbar">
                <div className="admin-search">
                    <Icon paths={ICONS.search} />
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name or email"
                        aria-label="Search accounts by name or email"
                    />
                </div>

                <select
                    className="admin-filter-select"
                    value={schoolFilter}
                    onChange={(e) => setSchoolFilter(e.target.value)}
                    aria-label="Filter by school"
                >
                    <option value={SCHOOL_FILTER_ALL}>All schools</option>
                    {schoolOptions.map((school) => (
                        <option key={school.value} value={school.value}>{school.label}</option>
                    ))}
                    {hasUnlinkedTeachers ? <option value={SCHOOL_FILTER_NONE}>No school linked</option> : null}
                </select>

                <div className="admin-filter-group" role="group" aria-label="Filter by status">
                    {STATUS_FILTERS.map((filter) => (
                        <button
                            key={filter.value}
                            type="button"
                            className={`admin-filter-btn ${statusFilter === filter.value ? "active" : ""}`}
                            aria-pressed={statusFilter === filter.value}
                            onClick={() => setStatusFilter(filter.value)}
                        >
                            {filter.label} <span className="admin-filter-count">{statusCounts[filter.value]}</span>
                        </button>
                    ))}
                </div>

                {/* Sorting on small screens, where the table header is not shown */}
                <div className="admin-mobile-sort">
                    <label htmlFor="admin-accounts-sort">Sort by</label>
                    <select id="admin-accounts-sort" value={sortKey} onChange={(e) => { setSortKey(e.target.value); setSortDirection("asc"); }}>
                        {COLUMNS.map((column) => (
                            <option key={column.key} value={column.key}>{column.label}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className="admin-icon-btn"
                        aria-label={sortDirection === "asc" ? "Sorted ascending. Switch to descending" : "Sorted descending. Switch to ascending"}
                        onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
                    >
                        <Icon paths={sortDirection === "asc" ? ICONS.sortAsc : ICONS.sortDesc} />
                    </button>
                </div>

                <button type="button" className="admin-btn primary admin-add-btn" onClick={openAddForm}>
                    <Icon paths={ICONS.plus} />
                    Add Account
                </button>
            </div>

            {/* List */}
            <div className="admin-card">
                {loading ? (
                    <div className="admin-state" role="status">Loading accounts…</div>
                ) : loadError ? (
                    <div className="admin-state" role="alert">
                        <h3>Accounts could not be loaded</h3>
                        <p>{loadError}</p>
                        <button type="button" className="admin-btn secondary" onClick={() => { setLoading(true); loadAccounts(); }}>
                            Try again
                        </button>
                    </div>
                ) : visibleAccounts.length === 0 ? (
                    <div className="admin-state">
                        <h3>No accounts match</h3>
                        <p>Try a different search or filter.</p>
                        {hasFilters ? (
                            <button type="button" className="admin-btn secondary" onClick={clearFilters}>
                                Clear search and filters
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <>
                        <div className="admin-table-wrapper">
                            <table className="admin-table admin-accounts-table">
                                <thead>
                                    <tr>
                                        {COLUMNS.map((column) => {
                                            const isSorted = sortKey === column.key;
                                            return (
                                                <th key={column.key} aria-sort={isSorted ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
                                                    <button type="button" className={`admin-sort-btn ${isSorted ? "sorted" : ""}`} onClick={() => handleSort(column.key)}>
                                                        {column.label}
                                                        <Icon paths={isSorted ? (sortDirection === "asc" ? ICONS.sortAsc : ICONS.sortDesc) : ICONS.sort} />
                                                    </button>
                                                </th>
                                            );
                                        })}
                                        <th className="admin-actions-head">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageAccounts.map((account) => (
                                        <tr key={account.account_id} className={account.is_active ? "" : "is-archived"}>
                                            <td data-label="Full name" className="admin-cell-name">
                                                {account.full_name || <span className="admin-muted">—</span>}
                                            </td>
                                            <td data-label="Email" className="admin-cell-wrap">{account.email || <span className="admin-muted">—</span>}</td>
                                            <td data-label="Role">{ROLE_LABEL}</td>
                                            <td data-label="School" className="admin-cell-wrap">{renderSchool(account)}</td>
                                            <td data-label="Status">
                                                {renderStatus(account)}
                                                {isBlockedBySchool(account) ? <span className="admin-status-note">School archived</span> : null}
                                            </td>
                                            <td data-label="Last login">{formatDateTime(account.last_login_at) || <span className="admin-muted">Never</span>}</td>
                                            <td data-label="Date created">{formatDate(account.created_at) || <span className="admin-muted">—</span>}</td>
                                            <td data-label="Actions" className="admin-cell-actions">{renderActions(account)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="admin-pagination">
                            <span className="admin-pagination-summary">
                                Showing {pageStart + 1}–{pageStart + pageAccounts.length} of {countLabel(visibleAccounts.length, "account")}
                            </span>
                            <div className="admin-pagination-controls">
                                <button type="button" className="admin-btn secondary small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                                    Previous
                                </button>
                                <span className="admin-pagination-page">Page {currentPage} of {pageCount}</span>
                                <button type="button" className="admin-btn secondary small" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Add / Edit Account */}
            {formOpen ? (
                <div className="admin-modal-overlay" onClick={closeForm}>
                    <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-account-form-title" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h2 id="admin-account-form-title">{editingAccount ? "Edit Account" : "Add Account"}</h2>
                            <button type="button" className="admin-icon-btn" aria-label="Close" onClick={closeForm}>
                                <Icon paths={ICONS.close} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveAccount} noValidate>
                            <div className="admin-modal-body">
                                {formMessage ? <div className="admin-form-alert" role="alert">{formMessage}</div> : null}

                                <div className="admin-form-grid">
                                    <div className="admin-form-field">
                                        <label htmlFor="account-first-name" className="required">First name</label>
                                        <input
                                            id="account-first-name"
                                            type="text"
                                            autoFocus
                                            value={form.firstName}
                                            maxLength={NAME_MAX_LENGTH}
                                            onChange={(e) => handleFormChange("firstName", e.target.value)}
                                            className={formErrors.firstName ? "error" : ""}
                                            aria-invalid={Boolean(formErrors.firstName)}
                                            aria-describedby={formErrors.firstName ? "account-first-name-error" : undefined}
                                        />
                                        {formErrors.firstName ? <span id="account-first-name-error" className="admin-form-error">{formErrors.firstName}</span> : null}
                                    </div>

                                    <div className="admin-form-field">
                                        <label htmlFor="account-middle-name">Middle name</label>
                                        <input
                                            id="account-middle-name"
                                            type="text"
                                            value={form.middleName}
                                            maxLength={NAME_MAX_LENGTH}
                                            onChange={(e) => handleFormChange("middleName", e.target.value)}
                                            className={formErrors.middleName ? "error" : ""}
                                            aria-invalid={Boolean(formErrors.middleName)}
                                            placeholder="Optional"
                                        />
                                        {formErrors.middleName ? <span className="admin-form-error">{formErrors.middleName}</span> : null}
                                    </div>

                                    <div className="admin-form-field full">
                                        <label htmlFor="account-last-name" className="required">Last name</label>
                                        <input
                                            id="account-last-name"
                                            type="text"
                                            value={form.lastName}
                                            maxLength={NAME_MAX_LENGTH}
                                            onChange={(e) => handleFormChange("lastName", e.target.value)}
                                            className={formErrors.lastName ? "error" : ""}
                                            aria-invalid={Boolean(formErrors.lastName)}
                                            aria-describedby={formErrors.lastName ? "account-last-name-error" : undefined}
                                        />
                                        {formErrors.lastName ? <span id="account-last-name-error" className="admin-form-error">{formErrors.lastName}</span> : null}
                                    </div>

                                    <div className="admin-form-field full">
                                        <label htmlFor="account-email" className="required">Email</label>
                                        <input
                                            id="account-email"
                                            type="email"
                                            value={form.email}
                                            maxLength={EMAIL_MAX_LENGTH}
                                            onChange={(e) => handleFormChange("email", e.target.value)}
                                            className={formErrors.email ? "error" : ""}
                                            aria-invalid={Boolean(formErrors.email)}
                                            aria-describedby={formErrors.email ? "account-email-error" : "account-email-hint"}
                                        />
                                        {formErrors.email
                                            ? <span id="account-email-error" className="admin-form-error">{formErrors.email}</span>
                                            : <span id="account-email-hint" className="admin-form-hint">Used to log in. Must be unique.</span>}
                                    </div>

                                    <div className="admin-form-field">
                                        <label htmlFor="account-school" className="required">School</label>
                                        <select
                                            id="account-school"
                                            value={form.schoolId}
                                            onChange={(e) => handleFormChange("schoolId", e.target.value)}
                                            className={formErrors.schoolId ? "error" : ""}
                                            aria-invalid={Boolean(formErrors.schoolId)}
                                            aria-describedby={formErrors.schoolId ? "account-school-error" : undefined}
                                        >
                                            <option value="">Choose a school</option>
                                            {formSchoolOptions.map((school) => (
                                                <option key={school.value} value={school.value}>{school.label}</option>
                                            ))}
                                        </select>
                                        {formErrors.schoolId
                                            ? <span id="account-school-error" className="admin-form-error">{formErrors.schoolId}</span>
                                            : formSchoolOptions.length === 0
                                                ? <span className="admin-form-hint">No active school yet. Add one in Schools first.</span>
                                                : null}
                                    </div>

                                    <div className="admin-form-field">
                                        <label htmlFor="account-contact-number">Contact number</label>
                                        <input
                                            id="account-contact-number"
                                            type="tel"
                                            value={form.contactNumber}
                                            maxLength={CONTACT_NUMBER_MAX_LENGTH}
                                            onChange={(e) => handleFormChange("contactNumber", e.target.value)}
                                            className={formErrors.contactNumber ? "error" : ""}
                                            aria-invalid={Boolean(formErrors.contactNumber)}
                                            aria-describedby={formErrors.contactNumber ? "account-contact-number-error" : undefined}
                                            placeholder="Optional"
                                        />
                                        {formErrors.contactNumber ? <span id="account-contact-number-error" className="admin-form-error">{formErrors.contactNumber}</span> : null}
                                    </div>

                                    {/* Default password: shown while adding only. Fixed, built from the name and today's date. */}
                                    {!editingAccount ? (
                                        <div className="admin-form-field full">
                                            <label htmlFor="account-password">Default password</label>
                                            <div className="admin-password-input">
                                                <input
                                                    id="account-password"
                                                    type={showFormPassword ? "text" : "password"}
                                                    value={passwordPreview}
                                                    readOnly
                                                    placeholder="Enter the first and last name"
                                                    aria-describedby="account-password-hint"
                                                />
                                                <button
                                                    type="button"
                                                    className="admin-icon-btn"
                                                    aria-label={showFormPassword ? "Hide password" : "Show password"}
                                                    aria-pressed={showFormPassword}
                                                    title={showFormPassword ? "Hide password" : "Show password"}
                                                    onClick={() => setShowFormPassword((prev) => !prev)}
                                                >
                                                    <Icon paths={showFormPassword ? ICONS.hide : ICONS.view} />
                                                </button>
                                            </div>
                                            <span id="account-password-hint" className="admin-form-hint">
                                                Set automatically: FirstName_LastName_mmddyy (today's date). The teacher must change it the first time they log in. No email is sent.
                                            </span>
                                        </div>
                                    ) : null}
                                </div>

                                {/* Students, sections and sessions belong to the teacher, so they follow the teacher to the new school */}
                                {schoolChanged ? (
                                    <div className="admin-note admin-note-below" role="note">
                                        <strong>Changing the school moves this teacher's records with them.</strong>{" "}
                                        Their {countLabel(editingAccount.student_count, "student")} and {countLabel(editingAccount.section_count, "section")},
                                        with their feeding sessions and past measurements, will be counted under the new school in every report,
                                        and no longer under {editingAccount.school_name || "the current school"}.
                                    </div>
                                ) : null}
                            </div>

                            <div className="admin-modal-actions">
                                <button type="button" className="admin-btn secondary" onClick={closeForm} disabled={isSaving}>
                                    Cancel
                                </button>
                                <button type="submit" className="admin-btn primary" disabled={isSaving}>
                                    {isSaving ? "Saving..." : editingAccount ? "Save Changes" : "Add Account"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {/* Account detail (read-only) */}
            {viewingAccount ? (
                <div className="admin-modal-overlay" onClick={closeView}>
                    <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-account-view-title" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <div className="admin-modal-title-group">
                                <h2 id="admin-account-view-title">{viewingAccount.full_name || viewingAccount.email}</h2>
                                {renderStatus(viewingAccount)}
                            </div>
                            <button type="button" className="admin-icon-btn" aria-label="Close" onClick={closeView}>
                                <Icon paths={ICONS.close} />
                            </button>
                        </div>

                        <div className="admin-modal-body">
                            {viewError ? <div className="admin-form-alert" role="alert">{viewError}</div> : null}

                            {isBlockedBySchool(viewingAccount) ? (
                                <div className="admin-note" role="note">
                                    This teacher's school is archived, so they cannot log in until the school is restored.
                                </div>
                            ) : null}

                            <div className="admin-stat-grid">
                                <div className="admin-stat"><span>Students</span><strong>{viewingAccount.student_count}</strong></div>
                                <div className="admin-stat"><span>Sections</span><strong>{viewingAccount.section_count}</strong></div>
                                <div className="admin-stat"><span>Last login</span><strong>{formatDateTime(viewingAccount.last_login_at) || "Never"}</strong></div>
                                <div className="admin-stat"><span>Date created</span><strong>{formatDate(viewingAccount.created_at) || "—"}</strong></div>
                            </div>

                            {/* A deactivated teacher's records are kept and counted, but nobody can edit them */}
                            {!viewingAccount.is_active && viewingOwnsRecords ? (
                                <div className="admin-note" role="note">
                                    <strong>No active handler.</strong> This teacher's students and sections stay visible and counted in reports,
                                    but cannot be edited until the account is reactivated or replaced.
                                </div>
                            ) : null}

                            <dl className="admin-detail-list">
                                <div><dt>First name</dt><dd>{viewingAccount.first_name || "—"}</dd></div>
                                <div><dt>Middle name</dt><dd>{viewingAccount.middle_name || "—"}</dd></div>
                                <div><dt>Last name</dt><dd>{viewingAccount.last_name || "—"}</dd></div>
                                <div><dt>Role</dt><dd>{ROLE_LABEL}</dd></div>
                                <div><dt>Email</dt><dd>{viewingAccount.email || "—"}</dd></div>
                                <div><dt>Contact number</dt><dd>{viewingAccount.mobile_no || "—"}</dd></div>
                                <div>
                                    <dt>School</dt>
                                    <dd>
                                        {viewingAccount.school_id !== null && viewingAccount.school_id !== undefined ? (
                                            <button type="button" className="admin-link-btn" onClick={() => navigate("/admin/schools")}>
                                                {viewingAccount.school_name}
                                            </button>
                                        ) : (
                                            viewingAccount.school_name || "No school linked"
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Password</dt>
                                    <dd>
                                        {/* TODO(password hashing): the stored password is shown here only while passwords are
                                            kept as plain text. Remove this field and its eye icon when passwords are hashed. */}
                                        {viewingAccount.password !== undefined ? (
                                            <span className="admin-password">
                                                <span className="admin-password-value">
                                                    {showPassword ? viewingAccount.password || "—" : "••••••••"}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="admin-icon-btn"
                                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                                    aria-pressed={showPassword}
                                                    title={showPassword ? "Hide password" : "Show password"}
                                                    onClick={() => setShowPassword((prev) => !prev)}
                                                >
                                                    <Icon paths={showPassword ? ICONS.hide : ICONS.view} />
                                                </button>
                                            </span>
                                        ) : (
                                            <span className="admin-muted">{viewLoading ? "Loading…" : "Not available"}</span>
                                        )}
                                        {viewingAccount.is_first_login ? (
                                            <span className="admin-form-hint admin-password-hint">Default password. Not changed by the user yet.</span>
                                        ) : null}
                                    </dd>
                                </div>
                            </dl>

                            <div className="admin-detail-section">
                                <h3>Activity</h3>
                                {/* Placeholder: this account's activity will be listed here once the Activity Log exists */}
                                <p className="admin-muted">Activity for this account will appear here once the Activity Log is available.</p>
                            </div>
                        </div>

                        <div className="admin-modal-actions">
                            <button type="button" className="admin-btn secondary" onClick={closeView}>
                                Close
                            </button>
                            <button type="button" className="admin-btn primary" onClick={() => openEditForm(viewingAccount)}>
                                Edit Account
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Deactivate / Reactivate confirmation */}
            {confirmAction ? (
                <div className="admin-modal-overlay" onClick={closeConfirm}>
                    <div className="admin-modal small" role="alertdialog" aria-modal="true" aria-labelledby="admin-account-confirm-title" aria-describedby="admin-account-confirm-body" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h2 id="admin-account-confirm-title">{confirmCopy.title}</h2>
                        </div>
                        <div className="admin-modal-body" id="admin-account-confirm-body">
                            {confirmCopy.body.filter(Boolean).map((line) => (
                                <p key={line}>{line}</p>
                            ))}
                        </div>
                        <div className="admin-modal-actions">
                            <button type="button" className="admin-btn secondary" onClick={closeConfirm} disabled={isConfirming} autoFocus>
                                Cancel
                            </button>
                            <button type="button" className={`admin-btn ${confirmCopy.tone}`} onClick={handleConfirm} disabled={isConfirming}>
                                {isConfirming ? "Please wait..." : confirmCopy.button}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Delete: a replacement teacher must be chosen first */}
            {deleteTarget ? (
                <div className="admin-modal-overlay" onClick={() => { if (!isDeleting) closeDelete(); }}>
                    <div className="admin-modal small" role="alertdialog" aria-modal="true" aria-labelledby="admin-account-delete-title" aria-describedby="admin-account-delete-body" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h2 id="admin-account-delete-title">Delete this account?</h2>
                        </div>
                        <div className="admin-modal-body" id="admin-account-delete-body">
                            <p>
                                <strong>{deleteTarget.full_name}</strong> will be permanently deleted. This cannot be undone.
                            </p>
                            <p>
                                Their {countLabel(deleteTarget.student_count, "student")}, {countLabel(deleteTarget.section_count, "section")} and{" "}
                                {countLabel(deleteSessionCount, "feeding session")} are handed to the replacement teacher first. Nothing is lost.
                                A section with the same grade and name as one the replacement already has gets "(from transfer)" added to its name.
                            </p>

                            {replacementsLoading ? (
                                <p className="admin-muted" role="status">Loading replacement teachers…</p>
                            ) : replacementsError ? (
                                <div className="admin-form-alert" role="alert">{replacementsError}</div>
                            ) : noReplacementAvailable ? (
                                <div className="admin-form-alert" role="alert">
                                    This account cannot be deleted yet: {deleteTarget.school_name || "this school"} has no other active teacher
                                    to take over the records. Add or reactivate another teacher in this school first.
                                </div>
                            ) : (
                                <div className="admin-form-field">
                                    <label htmlFor="account-replacement" className="required">Replacement teacher</label>
                                    <select id="account-replacement" value={replacementId} onChange={(e) => setReplacementId(e.target.value)} disabled={isDeleting}>
                                        <option value="">Choose a teacher</option>
                                        {replacements.map((teacher) => (
                                            <option key={teacher.account_id} value={String(teacher.account_id)}>
                                                {teacher.full_name} ({teacher.email})
                                            </option>
                                        ))}
                                    </select>
                                    <span className="admin-form-hint">Active teachers of {deleteTarget.school_name || "the same school"} only.</span>
                                </div>
                            )}
                        </div>
                        <div className="admin-modal-actions">
                            <button type="button" className="admin-btn secondary" onClick={closeDelete} disabled={isDeleting} autoFocus>
                                Cancel
                            </button>
                            <button type="button" className="admin-btn danger" onClick={handleDelete} disabled={!replacementId || isDeleting}>
                                {isDeleting ? "Please wait..." : "Delete account"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Reset password (UI ONLY: Confirm does not change anything yet) */}
            {resetTarget ? (
                <div className="admin-modal-overlay" onClick={() => setResetTarget(null)}>
                    <div className="admin-modal small" role="dialog" aria-modal="true" aria-labelledby="admin-account-reset-title" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h2 id="admin-account-reset-title">Reset password</h2>
                            <button type="button" className="admin-icon-btn" aria-label="Close" onClick={() => setResetTarget(null)}>
                                <Icon paths={ICONS.close} />
                            </button>
                        </div>
                        <div className="admin-modal-body">
                            <div className="admin-dialog-account">
                                <strong>{resetTarget.full_name}</strong>
                                <span>{resetTarget.email}</span>
                            </div>

                            <p>
                                A reset replaces this account's current password with the new password below. The old password stops working.
                            </p>
                            <p>
                                The user must choose their own password the next time they log in. No email is sent: give them the new password yourself.
                            </p>

                            <div className="admin-form-field">
                                <label htmlFor="account-reset-password">New password</label>
                                <div className="admin-password-input">
                                    <input
                                        id="account-reset-password"
                                        type={showResetPassword ? "text" : "password"}
                                        value={resetPasswordPreview}
                                        readOnly
                                        aria-describedby="account-reset-password-hint"
                                    />
                                    <button
                                        type="button"
                                        className="admin-icon-btn"
                                        aria-label={showResetPassword ? "Hide password" : "Show password"}
                                        aria-pressed={showResetPassword}
                                        title={showResetPassword ? "Hide password" : "Show password"}
                                        onClick={() => setShowResetPassword((prev) => !prev)}
                                    >
                                        <Icon paths={showResetPassword ? ICONS.hide : ICONS.view} />
                                    </button>
                                </div>
                                <span id="account-reset-password-hint" className="admin-form-hint">FirstName_LastName_mmddyy, with today's date.</span>
                            </div>

                            {resetMessage ? <div className="admin-note admin-note-below" role="status">{resetMessage}</div> : null}
                        </div>
                        <div className="admin-modal-actions">
                            <button type="button" className="admin-btn secondary" onClick={() => setResetTarget(null)}>
                                Cancel
                            </button>
                            <button type="button" className="admin-btn primary" onClick={handleConfirmReset}>
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

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

export default AdminAccounts
