import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
// Token-aware axios: attaches the login token and renews it when it expires (see ../api.js)
import { authAxios as axios } from "../api";

// STYLES
import "../styles/AdminSchoolsStyle.css";

// COMPONENTS
import AdminLayout from '../components/AdminLayout';

// ==============================
// Limits mirror the backend (server/admin.py). The server validates again and has the final say.
// ==============================
const SCHOOL_NAME_MAX_LENGTH = 255;
const ADDRESS_MAX_LENGTH = 255;
const CONTACT_PERSON_MAX_LENGTH = 255;
const CONTACT_NUMBER_MAX_LENGTH = 50;
const EMAIL_MAX_LENGTH = 255;
const DISTRICT_SCHOOL_ID_MAX_LENGTH = 20;
const PAGE_SIZE = 10;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CONTACT_NUMBER_PATTERN = /^[0-9+\-() ]+$/;
// Typed in capitals (the box turns letters into capitals as they are typed)
const DISTRICT_SCHOOL_ID_PATTERN = /^[A-Z0-9]+$/;

const STATUS_FILTERS = [
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
    { value: "all", label: "All" },
];

// Table columns, in display order. `numeric` columns sort as numbers and are right-aligned.
const COLUMNS = [
    { key: "school_name", label: "School name" },
    { key: "district_school_id", label: "District School ID" },
    { key: "address", label: "Location" },
    { key: "teacher_count", label: "Teachers", numeric: true },
    { key: "student_count", label: "Students", numeric: true },
    { key: "at_risk_percent", label: "At-Risk %", numeric: true },
    { key: "last_assessment_date", label: "Last assessment" },
    { key: "is_active", label: "Status" },
];

const EMPTY_FORM = {
    schoolName: "",
    address: "",
    contactPerson: "",
    contactNumber: "",
    email: "",
    isActive: true,
    // Typed when adding a school; "" = use the suggestion. Never sent when editing: it can't change.
    districtSchoolId: "",
};

// DISTRICT SCHOOL ID SUGGESTION (the same rule as school_abbreviation in server/admin.py)
// Shown in the Add form until the admin types their own. The abbreviation of the school's name:
// first letter (or digit) of every word, in capitals, accents removed, small words skipped.
//   Nueva Ecija High School       -> NEHS
//   Sto. Niño Elementary School   -> SNES
//   Science High School of Cabiao -> SHSC
// When the box is left as the suggestion, the server adds a number if another school already has
// the same letters (NEHS2).
const SCHOOL_ABBREVIATION_MAX_LENGTH = 16;
const SCHOOL_ABBREVIATION_SKIPPED_WORDS = new Set(["of", "the", "and", "for", "in", "at", "ng", "sa", "mga"]);

// Returns "" when the name has no letter or digit at all
const schoolAbbreviation = (schoolName) => {
    const everyInitial = [];
    const keptInitials = [];
    String(schoolName ?? "")
        .normalize("NFKD")
        .split(/\s+/)
        .forEach((word) => {
            const clean = word.replace(/[^A-Za-z0-9]/g, "");
            if (!clean) {
                return;
            }
            everyInitial.push(clean[0].toUpperCase());
            if (!SCHOOL_ABBREVIATION_SKIPPED_WORDS.has(clean.toLowerCase())) {
                keptInitials.push(clean[0].toUpperCase());
            }
        });
    // A name made only of small words keeps them all
    return (keptInitials.length ? keptInitials : everyInitial).join("").slice(0, SCHOOL_ABBREVIATION_MAX_LENGTH);
};

// Search key: ignores case, extra spaces and accents
const toSearchKey = (value) =>
    String(value ?? "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

// "2026-10-03" -> "Oct 3, 2026"
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

const formatAtRisk = (school) =>
    school.at_risk_percent === null || school.at_risk_percent === undefined
        ? ""
        : `${Number(school.at_risk_percent).toFixed(1)}%`;

// Empty values always sort last, whatever the direction
const compareSchools = (a, b, column, direction) => {
    const left = a[column.key];
    const right = b[column.key];
    const leftEmpty = left === null || left === undefined || left === "";
    const rightEmpty = right === null || right === undefined || right === "";
    if (leftEmpty || rightEmpty) {
        return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
    }

    let result;
    if (column.numeric || typeof left === "boolean") {
        result = Number(left) - Number(right);
    } else {
        result = String(left).localeCompare(String(right), undefined, { sensitivity: "base", numeric: true });
    }
    return direction === "asc" ? result : -result;
};

// Returns { field: message } for the Add / Edit form. The District School ID is checked only when adding.
const validateSchoolForm = (form, isAdding) => {
    const errors = {};
    const name = form.schoolName.replace(/\s+/g, " ").trim();
    const contactNumber = form.contactNumber.trim();
    const email = form.email.trim();
    const districtSchoolId = form.districtSchoolId.trim();

    if (isAdding && districtSchoolId) {
        if (districtSchoolId.length > DISTRICT_SCHOOL_ID_MAX_LENGTH) {
            errors.districtSchoolId = `District School ID can't be longer than ${DISTRICT_SCHOOL_ID_MAX_LENGTH} characters.`;
        } else if (!DISTRICT_SCHOOL_ID_PATTERN.test(districtSchoolId)) {
            errors.districtSchoolId = "Use letters and numbers only, without spaces.";
        }
    }

    if (!name) {
        errors.schoolName = "School name is required.";
    } else if (name.length > SCHOOL_NAME_MAX_LENGTH) {
        errors.schoolName = `School name can't be longer than ${SCHOOL_NAME_MAX_LENGTH} characters.`;
    } else if (!schoolAbbreviation(name)) {
        // The District School ID is built from the letters of the name
        errors.schoolName = "School name must contain at least one letter or number.";
    }
    if (contactNumber && (!CONTACT_NUMBER_PATTERN.test(contactNumber) || !/\d/.test(contactNumber))) {
        errors.contactNumber = "Use digits, spaces and + - ( ) only.";
    }
    if (email && !EMAIL_PATTERN.test(email)) {
        errors.email = "Enter a valid email address.";
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
    edit: ["M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"],
    archive: ["M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"],
    restore: ["M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"],
    delete: ["M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"],
    sort: ["M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"],
    sortAsc: ["M5 15l7-7 7 7"],
    sortDesc: ["M19 9l-7 7-7-7"],
};

function AdminSchools() {
    // Data
    const [schools, setSchools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    // List controls
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("active");
    const [sortKey, setSortKey] = useState("school_name");
    const [sortDirection, setSortDirection] = useState("asc");
    const [page, setPage] = useState(1);

    // Add / Edit form (null = closed). editingSchool is null when adding.
    const [formOpen, setFormOpen] = useState(false);
    const [editingSchool, setEditingSchool] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [formErrors, setFormErrors] = useState({});
    const [formMessage, setFormMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // View and confirmation dialogs
    const [viewingSchool, setViewingSchool] = useState(null);
    const [confirmAction, setConfirmAction] = useState(null); // { type: "archive" | "restore" | "delete", school }
    const [isConfirming, setIsConfirming] = useState(false);

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
    const loadSchools = useCallback(() => {
        setLoadError("");
        return axios
            .get("/api/admin/schools")
            .then((response) => {
                if (!response.data?.status) {
                    setLoadError(response.data?.message || "The schools could not be loaded.");
                    return;
                }
                setSchools(Array.isArray(response.data.schools) ? response.data.schools : []);
            })
            .catch((error) => {
                console.error("Fetching schools error:", error);
                setLoadError("The schools could not be loaded. Check your connection and try again.");
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        loadSchools();
    }, [loadSchools]);

    // ==========================
    // Derived list: filter -> search -> sort -> page
    // ==========================
    const statusCounts = useMemo(() => ({
        active: schools.filter((school) => school.is_active).length,
        archived: schools.filter((school) => !school.is_active).length,
        all: schools.length,
    }), [schools]);

    const visibleSchools = useMemo(() => {
        const query = toSearchKey(searchQuery);
        const column = COLUMNS.find((item) => item.key === sortKey) || COLUMNS[0];

        return schools
            .filter((school) => {
                if (statusFilter === "active" && !school.is_active) return false;
                if (statusFilter === "archived" && school.is_active) return false;
                if (!query) return true;
                return toSearchKey(school.school_name).includes(query) || toSearchKey(school.district_school_id).includes(query);
            })
            .sort((a, b) => compareSchools(a, b, column, sortDirection) || compareSchools(a, b, COLUMNS[0], "asc"));
    }, [schools, searchQuery, statusFilter, sortKey, sortDirection]);

    const pageCount = Math.max(1, Math.ceil(visibleSchools.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const pageStart = (currentPage - 1) * PAGE_SIZE;
    const pageSchools = visibleSchools.slice(pageStart, pageStart + PAGE_SIZE);

    // A new search, filter or sort starts again from the first page
    useEffect(() => {
        setPage(1);
    }, [searchQuery, statusFilter, sortKey, sortDirection]);

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDirection("asc");
        }
    };

    const hasFilters = Boolean(searchQuery.trim()) || statusFilter !== "active";

    const clearFilters = () => {
        setSearchQuery("");
        setStatusFilter("active");
    };

    // ==========================
    // Add / Edit
    // ==========================
    const openAddForm = () => {
        setEditingSchool(null);
        setForm(EMPTY_FORM);
        setFormErrors({});
        setFormMessage("");
        setFormOpen(true);
    };

    const openEditForm = (school) => {
        setViewingSchool(null);
        setEditingSchool(school);
        setForm({
            schoolName: school.school_name || "",
            address: school.address || "",
            contactPerson: school.contact_person || "",
            contactNumber: school.contact_number || "",
            email: school.email || "",
            isActive: Boolean(school.is_active),
            districtSchoolId: "",
        });
        setFormErrors({});
        setFormMessage("");
        setFormOpen(true);
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

    // District School ID box: when adding, what the admin typed, or else the suggestion for the name
    // typed so far; when editing, the school's own id (read-only: it never changes).
    const districtSchoolIdSuggestion = schoolAbbreviation(form.schoolName);
    const districtSchoolIdValue = editingSchool
        ? editingSchool.district_school_id || ""
        : form.districtSchoolId || districtSchoolIdSuggestion;

    const handleSaveSchool = (e) => {
        e.preventDefault();
        if (isSaving) {
            return;
        }

        const errors = validateSchoolForm(form, !editingSchool);
        setFormErrors(errors);
        if (Object.keys(errors).length) {
            setFormMessage("Please fix the highlighted fields.");
            return;
        }

        const payload = {
            schoolName: form.schoolName,
            address: form.address,
            contactPerson: form.contactPerson,
            contactNumber: form.contactNumber,
            email: form.email,
            isActive: form.isActive,
        };
        // Sent only when adding, and only when typed: empty lets the server use the suggestion
        // (with a number added if another school already has those letters)
        if (!editingSchool) {
            payload.districtSchoolId = form.districtSchoolId.trim();
        }

        setIsSaving(true);
        const request = editingSchool
            ? axios.put(`/api/admin/schools/${editingSchool.school_id}`, payload)
            : axios.post("/api/admin/schools", payload);

        request
            .then((response) => {
                const data = response.data;
                if (!data?.status) {
                    // Duplicate or invalid values are reported per field by the server
                    setFormErrors(data?.errors || {});
                    setFormMessage(data?.message || "The school could not be saved. Try again.");
                    return;
                }

                setFormOpen(false);
                showToast("success", editingSchool ? `${data.school.school_name} was updated.` : `${data.school.school_name} was added.`);
                return loadSchools();
            })
            .catch((error) => {
                console.error("Saving school error:", error);
                setFormMessage("The school could not be saved. Check your connection and try again.");
            })
            .finally(() => {
                setIsSaving(false);
            });
    };

    // ==========================
    // Archive / Restore / Delete
    // ==========================
    const requestDelete = (school) => {
        // Not allowed while the school still has teachers: explain why instead of opening the dialog
        if (!school.can_delete) {
            showToast("error", school.delete_blocked_reason || "This school can't be deleted.");
            return;
        }
        setViewingSchool(null);
        setConfirmAction({ type: "delete", school });
    };

    const requestArchiveOrRestore = (school) => {
        setViewingSchool(null);
        setConfirmAction({ type: school.is_active ? "archive" : "restore", school });
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
        const { type, school } = confirmAction;
        const request =
            type === "delete"
                ? axios.delete(`/api/admin/schools/${school.school_id}`)
                : axios.post(`/api/admin/schools/${school.school_id}/${type}`);

        setIsConfirming(true);
        request
            .then((response) => {
                if (!response.data?.status) {
                    showToast("error", response.data?.message || "Something went wrong. Try again.");
                    return;
                }
                const done = { archive: "was archived", restore: "was restored", delete: "was deleted" }[type];
                showToast("success", `${school.school_name} ${done}.`);
                setConfirmAction(null);
                return loadSchools();
            })
            .catch((error) => {
                console.error("School action error:", error);
                showToast("error", "Something went wrong. Check your connection and try again.");
            })
            .finally(() => {
                setIsConfirming(false);
            });
    };

    // Escape closes whichever dialog is open
    useEffect(() => {
        if (!formOpen && !viewingSchool && !confirmAction) {
            return;
        }
        const handleKeyDown = (event) => {
            if (event.key !== "Escape") {
                return;
            }
            if (confirmAction) {
                if (!isConfirming) setConfirmAction(null);
            } else if (formOpen) {
                if (!isSaving) setFormOpen(false);
            } else {
                setViewingSchool(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [formOpen, viewingSchool, confirmAction, isConfirming, isSaving]);

    // ==========================
    // Render helpers
    // ==========================
    const renderStatus = (school) => (
        <span className={`admin-status-badge ${school.is_active ? "active" : "archived"}`}>
            {school.is_active ? "Active" : "Archived"}
        </span>
    );

    const renderActions = (school) => (
        <div className="admin-row-actions">
            <button type="button" className="admin-icon-btn" title="View" aria-label={`View ${school.school_name}`} onClick={() => setViewingSchool(school)}>
                <Icon paths={ICONS.view} />
                <span>View</span>
            </button>
            <button type="button" className="admin-icon-btn" title="Edit" aria-label={`Edit ${school.school_name}`} onClick={() => openEditForm(school)}>
                <Icon paths={ICONS.edit} />
                <span>Edit</span>
            </button>
            <button
                type="button"
                className="admin-icon-btn"
                title={school.is_active ? "Archive" : "Restore"}
                aria-label={`${school.is_active ? "Archive" : "Restore"} ${school.school_name}`}
                onClick={() => requestArchiveOrRestore(school)}
            >
                <Icon paths={school.is_active ? ICONS.archive : ICONS.restore} />
                <span>{school.is_active ? "Archive" : "Restore"}</span>
            </button>
            {/* aria-disabled (not disabled) so the reason can be shown on hover and on tap */}
            <button
                type="button"
                className={`admin-icon-btn danger ${school.can_delete ? "" : "is-disabled"}`}
                title={school.can_delete ? "Delete" : school.delete_blocked_reason}
                aria-label={`Delete ${school.school_name}`}
                aria-disabled={!school.can_delete}
                onClick={() => requestDelete(school)}
            >
                <Icon paths={ICONS.delete} />
                <span>Delete</span>
            </button>
        </div>
    );

    const confirmCopy = confirmAction && {
        archive: {
            title: "Archive this school?",
            body: [
                `${confirmAction.school.school_name} will be hidden from active lists and dropdowns.`,
                "Its teachers, students and records are kept. Nothing is deleted.",
                confirmAction.school.teacher_count > 0
                    ? `Its ${confirmAction.school.teacher_count} teacher${confirmAction.school.teacher_count === 1 ? "" : "s"} will not be able to log in until the school is restored.`
                    : null,
                "You can restore it at any time from the Archived list.",
            ],
            button: "Archive school",
            tone: "warning",
        },
        restore: {
            title: "Restore this school?",
            body: [
                `${confirmAction.school.school_name} will return to the active list with everything intact.`,
                confirmAction.school.teacher_count > 0 ? "Its teachers will be able to log in again." : null,
            ],
            button: "Restore school",
            tone: "primary",
        },
        delete: {
            title: "Delete this school?",
            body: [
                `${confirmAction.school.school_name} will be permanently deleted. This cannot be undone.`,
                "It has no teachers, students or records.",
            ],
            button: "Delete school",
            tone: "danger",
        },
    }[confirmAction.type];

    return (
        <AdminLayout active="schools" title="Schools" documentTitle="Feeding Program | Schools">
            {/* Controls */}
            <div className="admin-toolbar">
                <div className="admin-search">
                    <Icon paths={ICONS.search} />
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name or District School ID"
                        aria-label="Search schools by name or District School ID"
                    />
                </div>

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
                    <label htmlFor="admin-schools-sort">Sort by</label>
                    <select id="admin-schools-sort" value={sortKey} onChange={(e) => { setSortKey(e.target.value); setSortDirection("asc"); }}>
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
                    Add School
                </button>
            </div>

            {/* List */}
            <div className="admin-card">
                {loading ? (
                    <div className="admin-state" role="status">Loading schools…</div>
                ) : loadError ? (
                    <div className="admin-state" role="alert">
                        <h3>Schools could not be loaded</h3>
                        <p>{loadError}</p>
                        <button type="button" className="admin-btn secondary" onClick={() => { setLoading(true); loadSchools(); }}>
                            Try again
                        </button>
                    </div>
                ) : schools.length === 0 ? (
                    <div className="admin-state">
                        <h3>No schools yet</h3>
                        <p>Add the first school to start assigning teachers.</p>
                        <button type="button" className="admin-btn primary" onClick={openAddForm}>
                            <Icon paths={ICONS.plus} />
                            Add School
                        </button>
                    </div>
                ) : visibleSchools.length === 0 ? (
                    <div className="admin-state">
                        <h3>No schools match</h3>
                        <p>Try a different search or status filter.</p>
                        {hasFilters ? (
                            <button type="button" className="admin-btn secondary" onClick={clearFilters}>
                                Clear search and filter
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <>
                        <div className="admin-table-wrapper">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        {COLUMNS.map((column) => {
                                            const isSorted = sortKey === column.key;
                                            return (
                                                <th
                                                    key={column.key}
                                                    className={column.numeric ? "numeric" : ""}
                                                    aria-sort={isSorted ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                                                >
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
                                    {pageSchools.map((school) => (
                                        <tr key={school.school_id} className={school.is_active ? "" : "is-archived"}>
                                            <td data-label="School name" className="admin-cell-name">{school.school_name}</td>
                                            <td data-label="District School ID">{school.district_school_id || <span className="admin-muted">—</span>}</td>
                                            <td data-label="Location" className="admin-cell-wrap">{school.address || <span className="admin-muted">—</span>}</td>
                                            <td data-label="Teachers" className="numeric">{school.teacher_count}</td>
                                            <td data-label="Students" className="numeric">{school.student_count}</td>
                                            <td data-label="At-Risk %" className="numeric">
                                                {formatAtRisk(school)
                                                    ? <span title={`${school.at_risk_count} of ${school.student_count} students`}>{formatAtRisk(school)}</span>
                                                    : <span className="admin-muted">—</span>}
                                            </td>
                                            <td data-label="Last assessment">{formatDate(school.last_assessment_date) || <span className="admin-muted">—</span>}</td>
                                            <td data-label="Status">{renderStatus(school)}</td>
                                            <td data-label="Actions" className="admin-cell-actions">{renderActions(school)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="admin-pagination">
                            <span className="admin-pagination-summary">
                                Showing {pageStart + 1}–{pageStart + pageSchools.length} of {visibleSchools.length} school{visibleSchools.length === 1 ? "" : "s"}
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

            {/* Add / Edit School */}
            {formOpen ? (
                <div className="admin-modal-overlay" onClick={closeForm}>
                    <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-school-form-title" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h2 id="admin-school-form-title">{editingSchool ? "Edit School" : "Add School"}</h2>
                            <button type="button" className="admin-icon-btn" aria-label="Close" onClick={closeForm}>
                                <Icon paths={ICONS.close} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveSchool} noValidate>
                            <div className="admin-modal-body">
                                {formMessage ? <div className="admin-form-alert" role="alert">{formMessage}</div> : null}

                                <div className="admin-form-grid">
                                    <div className="admin-form-field full">
                                        <label htmlFor="school-name" className="required">School name</label>
                                        <input
                                            id="school-name"
                                            type="text"
                                            autoFocus
                                            value={form.schoolName}
                                            maxLength={SCHOOL_NAME_MAX_LENGTH}
                                            onChange={(e) => handleFormChange("schoolName", e.target.value)}
                                            className={formErrors.schoolName ? "error" : ""}
                                            aria-invalid={Boolean(formErrors.schoolName)}
                                            aria-describedby={formErrors.schoolName ? "school-name-error" : undefined}
                                            placeholder="e.g. San Isidro Elementary School"
                                        />
                                        {formErrors.schoolName ? <span id="school-name-error" className="admin-form-error">{formErrors.schoolName}</span> : null}
                                    </div>

                                    <div className="admin-form-field">
                                        {/* Set once: typed (or the suggestion kept) when adding, read-only when editing */}
                                        <label htmlFor="school-district-id">District School ID</label>
                                        <input
                                            id="school-district-id"
                                            type="text"
                                            value={districtSchoolIdValue}
                                            readOnly={Boolean(editingSchool)}
                                            maxLength={DISTRICT_SCHOOL_ID_MAX_LENGTH}
                                            onChange={editingSchool ? undefined : (e) => handleFormChange("districtSchoolId", e.target.value.toUpperCase())}
                                            className={formErrors.districtSchoolId ? "error" : ""}
                                            aria-invalid={Boolean(formErrors.districtSchoolId)}
                                            aria-describedby={formErrors.districtSchoolId ? "school-district-id-error school-district-id-hint" : "school-district-id-hint"}
                                            autoComplete="off"
                                            spellCheck={false}
                                            placeholder="e.g. NEHS"
                                        />
                                        {formErrors.districtSchoolId ? <span id="school-district-id-error" className="admin-form-error">{formErrors.districtSchoolId}</span> : null}
                                        <span id="school-district-id-hint" className="admin-form-hint">
                                            {editingSchool
                                                ? "Set when the school was added. It can't be changed."
                                                : "Suggested from the school name (a number is added if it's taken). Letters and numbers only. Can't be changed after the school is added."}
                                        </span>
                                    </div>

                                    <div className="admin-form-field">
                                        <label htmlFor="school-status">Status</label>
                                        <select id="school-status" value={form.isActive ? "active" : "archived"} onChange={(e) => handleFormChange("isActive", e.target.value === "active")}>
                                            <option value="active">Active</option>
                                            <option value="archived">Archived</option>
                                        </select>
                                    </div>

                                    <div className="admin-form-field full">
                                        <label htmlFor="school-address">Address</label>
                                        <input
                                            id="school-address"
                                            type="text"
                                            value={form.address}
                                            maxLength={ADDRESS_MAX_LENGTH}
                                            onChange={(e) => handleFormChange("address", e.target.value)}
                                            className={formErrors.address ? "error" : ""}
                                            aria-invalid={Boolean(formErrors.address)}
                                            placeholder="Optional"
                                        />
                                        {formErrors.address ? <span className="admin-form-error">{formErrors.address}</span> : null}
                                    </div>

                                    <div className="admin-form-field full">
                                        <label htmlFor="school-contact-person">School head or contact person</label>
                                        <input
                                            id="school-contact-person"
                                            type="text"
                                            value={form.contactPerson}
                                            maxLength={CONTACT_PERSON_MAX_LENGTH}
                                            onChange={(e) => handleFormChange("contactPerson", e.target.value)}
                                            className={formErrors.contactPerson ? "error" : ""}
                                            aria-invalid={Boolean(formErrors.contactPerson)}
                                            placeholder="Optional"
                                        />
                                        {formErrors.contactPerson ? <span className="admin-form-error">{formErrors.contactPerson}</span> : null}
                                    </div>

                                    <div className="admin-form-field">
                                        <label htmlFor="school-contact-number">Contact number</label>
                                        <input
                                            id="school-contact-number"
                                            type="tel"
                                            value={form.contactNumber}
                                            maxLength={CONTACT_NUMBER_MAX_LENGTH}
                                            onChange={(e) => handleFormChange("contactNumber", e.target.value)}
                                            className={formErrors.contactNumber ? "error" : ""}
                                            aria-invalid={Boolean(formErrors.contactNumber)}
                                            aria-describedby={formErrors.contactNumber ? "school-contact-number-error" : undefined}
                                            placeholder="Optional"
                                        />
                                        {formErrors.contactNumber ? <span id="school-contact-number-error" className="admin-form-error">{formErrors.contactNumber}</span> : null}
                                    </div>

                                    <div className="admin-form-field">
                                        <label htmlFor="school-email">Email</label>
                                        <input
                                            id="school-email"
                                            type="email"
                                            value={form.email}
                                            maxLength={EMAIL_MAX_LENGTH}
                                            onChange={(e) => handleFormChange("email", e.target.value)}
                                            className={formErrors.email ? "error" : ""}
                                            aria-invalid={Boolean(formErrors.email)}
                                            aria-describedby={formErrors.email ? "school-email-error" : undefined}
                                            placeholder="Optional"
                                        />
                                        {formErrors.email ? <span id="school-email-error" className="admin-form-error">{formErrors.email}</span> : null}
                                    </div>
                                </div>
                            </div>

                            <div className="admin-modal-actions">
                                <button type="button" className="admin-btn secondary" onClick={closeForm} disabled={isSaving}>
                                    Cancel
                                </button>
                                <button type="submit" className="admin-btn primary" disabled={isSaving}>
                                    {isSaving ? "Saving..." : editingSchool ? "Save Changes" : "Add School"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {/* View School (read-only). The full school detail page will replace this. */}
            {viewingSchool ? (
                <div className="admin-modal-overlay" onClick={() => setViewingSchool(null)}>
                    <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-school-view-title" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <div className="admin-modal-title-group">
                                <h2 id="admin-school-view-title">{viewingSchool.school_name}</h2>
                                {renderStatus(viewingSchool)}
                            </div>
                            <button type="button" className="admin-icon-btn" aria-label="Close" onClick={() => setViewingSchool(null)}>
                                <Icon paths={ICONS.close} />
                            </button>
                        </div>

                        <div className="admin-modal-body">
                            <div className="admin-stat-grid">
                                <div className="admin-stat"><span>Teachers</span><strong>{viewingSchool.teacher_count}</strong></div>
                                <div className="admin-stat"><span>Students</span><strong>{viewingSchool.student_count}</strong></div>
                                <div className="admin-stat"><span>At-Risk</span><strong>{formatAtRisk(viewingSchool) || "—"}</strong></div>
                                <div className="admin-stat"><span>Last assessment</span><strong>{formatDate(viewingSchool.last_assessment_date) || "—"}</strong></div>
                            </div>

                            <dl className="admin-detail-list">
                                <div><dt>District School ID</dt><dd>{viewingSchool.district_school_id || "—"}</dd></div>
                                <div><dt>Address</dt><dd>{viewingSchool.address || "—"}</dd></div>
                                <div><dt>School head or contact person</dt><dd>{viewingSchool.contact_person || "—"}</dd></div>
                                <div><dt>Contact number</dt><dd>{viewingSchool.contact_number || "—"}</dd></div>
                                <div><dt>Email</dt><dd>{viewingSchool.email || "—"}</dd></div>
                                <div><dt>Added</dt><dd>{formatDate(viewingSchool.created_at) || "—"}</dd></div>
                            </dl>
                        </div>

                        <div className="admin-modal-actions">
                            <button type="button" className="admin-btn secondary" onClick={() => setViewingSchool(null)}>
                                Close
                            </button>
                            <button type="button" className="admin-btn primary" onClick={() => openEditForm(viewingSchool)}>
                                Edit School
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Archive / Restore / Delete confirmation */}
            {confirmAction ? (
                <div className="admin-modal-overlay" onClick={closeConfirm}>
                    <div className="admin-modal small" role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-body" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h2 id="admin-confirm-title">{confirmCopy.title}</h2>
                        </div>
                        <div className="admin-modal-body" id="admin-confirm-body">
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

export default AdminSchools
