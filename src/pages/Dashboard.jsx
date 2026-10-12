// PACKAGES
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from "react-router";
// Token-aware axios: attaches the login token and renews it when it expires (see ../api.js)
import { authAxios as axios } from "../api";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Helmet } from 'react-helmet'


// STYLES
import "../styles/DashboardStyle.css";

// COMPONENTS
import Loading from '../components/Loading';

// Images
import Logo from '../images/logo.png'
import { apiFetch, initAuth, logout } from "../api";

// BMI statuses shown on the dashboard (labels only; classification happens on the server).
// DepEd labels (WHO 2007) plus "underweight", used by the standard rule and by entries recorded with the old method.
const BMI_STATUS_SERIES = [
    { key: "severely_wasted", status: "severely wasted", label: "Severely Wasted", color: "#dc2626" },
    { key: "wasted", status: "wasted", label: "Wasted", color: "#f97316" },
    { key: "underweight", status: "underweight", label: "Underweight", color: "#fdba74" },
    { key: "normal", status: "normal", label: "Normal", color: "#22c55e" },
    { key: "overweight", status: "overweight", label: "Overweight", color: "#3b82f6" },
    { key: "obese", status: "obese", label: "Obese", color: "#7c3aed" },
];

// Distance from Normal, used to describe a change as improved / declined
const BMI_STATUS_RANK = {
    "severely wasted": -2,
    "wasted": -1,
    "underweight": -1,
    "normal": 0,
    "overweight": 1,
    "obese": 2,
};

function Dashboard() {
    const navigate = useNavigate()
    const [user, setUser] = useState(null);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [studentsFetchDone, setStudentsFetchDone] = useState(false);
    const [students, setStudents] = useState([]);
    const [sections, setSections] = useState([]);
    const [statusSummaryRows, setStatusSummaryRows] = useState([]);
    const [bmiTrendRows, setBmiTrendRows] = useState([]);
    const [nearestSessionStatus, setNearestSessionStatus] = useState({
        kind: "empty",
        title: "Empty",
        description: "No upcoming feeding program",
    });
    const [totalCompletedSessions, setTotalCompletedSessions] = useState(0);

    // ** FETCH USER
    const handleMe = () => {
        apiFetch({ method: "get", url: "/me" })
            .then(response => {
                console.log(response)
                if (response.data?.status) {
                    setUser(response.data);
                }
            }).catch(err => {
                console.log(err)
            })
    }

    // *CHECK IF THERE IS A USER LOGGED
    useEffect(() => {
        let isMounted = true;
        const loadUser = async () => {
            const data = await initAuth();
            if (!isMounted) {
                return;
            }
            if (data?.status) {
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

    useEffect(() => {
        if (!user?.id) {
            return;
        }

        let isMounted = true;
        setStudentsFetchDone(false);

        axios
            .get("/api/get_all_students", {
                params: { userId: user.id },
            })
            .then((response) => {
                const data = response.data;
                if (!data?.status) {
                    console.warn("Dashboard get_all_students failed:", data);
                    return;
                }

                const students = Array.isArray(data.students) ? data.students : [];
                setStudents(students)
                console.log("Dashboard students:", students);
            })
            .catch((error) => {
                console.error("Dashboard get_all_students error:", error);
            })
            .finally(() => {
                if (!isMounted) {
                    return;
                }
                setStudentsFetchDone(true);
            });

        return () => {
            isMounted = false;
        };
    }, [user?.id]);

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
            // console.log(data)
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
            console.log("Sections: ", fetchedSections)
        })
        .catch((error) => {
            console.error("Fetching sections error:", error);
        });
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) {
            return;
        }

        axios
            .get("/api/get_all_status_count", {
                params: { userId: user.id },
            })
            .then((response) => {
                const data = response.data;
                if (!data?.status) {
                    console.warn("Dashboard get_all_status_count failed:", data);
                    setStatusSummaryRows([]);
                    return;
                }
                const summaryRows = Array.isArray(data.Summary) ? data.Summary : [];
                setStatusSummaryRows(summaryRows);
                console.log("Dashboard status summary:", summaryRows);
            })
            .catch((error) => {
                console.error("Dashboard get_all_status_count error:", error);
                setStatusSummaryRows([]);
            });
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) {
            setBmiTrendRows([]);
            return;
        }

        axios
            .get("/api/get_bmi_trend", {
                params: { userId: user.id },
            })
            .then((response) => {
                const data = response.data;
                if (!data?.status) {
                    console.warn("Dashboard get_bmi_trend failed:", data);
                    setBmiTrendRows([]);
                    return;
                }

                const summaryRows = Array.isArray(data.Summary) ? data.Summary : [];
                setBmiTrendRows(summaryRows);
                console.log("Dashboard BMI trend:", summaryRows);
            })
            .catch((error) => {
                console.error("Dashboard get_bmi_trend error:", error);
                setBmiTrendRows([]);
            });
    }, [user?.id]);


    useEffect(() => {
        const emptyState = {
            kind: "empty",
            title: "Empty",
            description: "No upcoming feeding program",
        };

        if (!user?.id) {
            setNearestSessionStatus(emptyState);
            setTotalCompletedSessions(0);
            return;
        }

        const toLocalDateOnly = (value) => {
            const raw = String(value ?? "").trim();
            if (!raw) {
                return null;
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                const [year, month, day] = raw.split("-").map(Number);
                return new Date(year, month - 1, day);
            }
            const parsed = new Date(raw);
            if (Number.isNaN(parsed.getTime())) {
                return null;
            }
            return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        };

        axios
            .get("/api/get_nearest_upcoming_session", {
                params: { userId: user.id },
            })
            .then((response) => {
                const data = response.data;
                if (!data?.status) {
                    setNearestSessionStatus(emptyState);
                    setTotalCompletedSessions(0);
                    return;
                }

                const totalCompleted = Number(data.totalCompleted ?? 0);
                setTotalCompletedSessions(Number.isNaN(totalCompleted) ? 0 : totalCompleted);

                const nearestSession = data.nearestSession || (Array.isArray(data.sessions) ? data.sessions[0] : null);
                if (!nearestSession) {
                    setNearestSessionStatus(emptyState);
                    return;
                }

                const sessionDateRaw = Array.isArray(nearestSession)
                    ? nearestSession[1]
                    : nearestSession?.session_date ?? nearestSession?.sessionDate;
                const sessionDate = toLocalDateOnly(sessionDateRaw);

                if (!sessionDate) {
                    setNearestSessionStatus(emptyState);
                    return;
                }

                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const dayMs = 1000 * 60 * 60 * 24;
                const daysUntil = Math.round((sessionDate.getTime() - today.getTime()) / dayMs);

                if (daysUntil <= 0) {
                    setNearestSessionStatus({
                        kind: "today",
                        title: "Today",
                        description: "Feeding program is scheduled today",
                    });
                    return;
                }

                setNearestSessionStatus({
                    kind: "upcoming",
                    title: "Upcoming",
                    description: `${daysUntil} day${daysUntil === 1 ? "" : "s"} before nearest feeding program`,
                });
            })
            .catch((error) => {
                console.error("Dashboard get_nearest_upcoming_session error:", error);
                setNearestSessionStatus(emptyState);
                setTotalCompletedSessions(0);
            });
    }, [user?.id]);




    const [selectedSection, setSelectedSection] = useState("all");
    const teacherName = user?.first_name
        ? `${user.first_name} ${user.last_name}`
        : "Teacher";
    const selectedSectionLabel =
        selectedSection === "all"
            ? "All Sections"
            : (sections.find((section) => section.id === selectedSection)?.name || "All Sections");

    const getLatestBmiStatus = (value) => {
        let parsed = value;

        if (typeof parsed === "string") {
            const raw = parsed.trim();
            if (!raw) {
                return "";
            }
            try {
                parsed = JSON.parse(raw);
            } catch (error) {
                parsed = raw;
            }
        }

        let latest = parsed;
        if (Array.isArray(parsed)) {
            latest = parsed.length ? parsed[parsed.length - 1] : "";
        }

        const normalized = String(latest ?? "")
            .trim()
            .replace(/^"+|"+$/g, "")
            .toLowerCase();

        return normalized;
    };

    // Students come from the API as named fields (see server/students.py)
    const studentsInScope = selectedSection === "all"
        ? students
        : students.filter((student) => String(student?.section_id ?? "") === String(selectedSection));

    // At risk: the latest BMI status is anything other than Normal (students with no measurement are not counted)
    const atRiskStudentsCount = studentsInScope.reduce((count, student) => {
        const latestStatus = getLatestBmiStatus(student?.bmi_measurement ?? "");
        if (latestStatus && latestStatus !== "normal") {
            return count + 1;
        }
        return count;
    }, 0);

    const bmiData = useMemo(() => {
        const parseCount = (value) => {
            const parsed = Number(value);
            return Number.isNaN(parsed) ? 0 : parsed;
        };

        const formatMonthLabel = (rawMonth) => {
            const parsedDate = new Date(rawMonth);
            if (Number.isNaN(parsedDate.getTime())) {
                return String(rawMonth || "");
            }
            return parsedDate.toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
                timeZone: "UTC",
            });
        };

        // Rows are named fields: one count per BMI status (see server/charts.py)
        const normalizedRows = statusSummaryRows
            .map((row) => {
                if (!row || typeof row !== "object" || Array.isArray(row)) {
                    return null;
                }

                const counts = {};
                BMI_STATUS_SERIES.forEach((series) => {
                    counts[series.key] = parseCount(row[`${series.key}_count`]);
                });

                return {
                    sectionId: String(row.section_id ?? ""),
                    month: String(row.month ?? ""),
                    ...counts,
                };
            })
            .filter(Boolean)
            .filter((row) => row.month);

        const filteredRows = selectedSection === "all"
            ? normalizedRows
            : normalizedRows.filter((row) => row.sectionId === String(selectedSection));

        const monthlyTotalsMap = new Map();
        filteredRows.forEach((row) => {
            if (!monthlyTotalsMap.has(row.month)) {
                const emptyCounts = { month: row.month };
                BMI_STATUS_SERIES.forEach((series) => {
                    emptyCounts[series.key] = 0;
                });
                monthlyTotalsMap.set(row.month, emptyCounts);
            }

            const aggregate = monthlyTotalsMap.get(row.month);
            BMI_STATUS_SERIES.forEach((series) => {
                aggregate[series.key] += row[series.key];
            });
        });

        const chartRows = Array.from(monthlyTotalsMap.values())
            .sort((left, right) => {
                const leftTime = Date.parse(left.month);
                const rightTime = Date.parse(right.month);
                const safeLeft = Number.isNaN(leftTime) ? 0 : leftTime;
                const safeRight = Number.isNaN(rightTime) ? 0 : rightTime;
                return safeLeft - safeRight;
            })
            .slice(-4)
            .map((row) => ({
                ...row,
                month: formatMonthLabel(row.month),
            }));

        return chartRows;
    }, [statusSummaryRows, selectedSection]);

    // Only draw the statuses that actually appear (Normal is always shown)
    const visibleBmiSeries = BMI_STATUS_SERIES.filter(
        (series) => series.key === "normal" || bmiData.some((row) => row[series.key] > 0)
    );

    const bmiLineData = useMemo(() => {
        const toMonthLabel = (rawMonth) => {
            const raw = String(rawMonth ?? "").trim();
            if (!raw) {
                return "";
            }
            const [yearStr, monthStr] = raw.split("-");
            const year = Number(yearStr);
            const month = Number(monthStr);
            if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
                return raw;
            }
            return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
                timeZone: "UTC",
            });
        };

        const normalizedRows = bmiTrendRows
            .map((row) => {
                if (!Array.isArray(row) || row.length < 3) {
                    return null;
                }

                const sectionId = String(row[0] ?? "");
                const measurementMonth = String(row[1] ?? "").trim();
                const averageBmi = Number(row[2]);

                if (!measurementMonth || Number.isNaN(averageBmi)) {
                    return null;
                }

                return {
                    sectionId,
                    measurementMonth,
                    averageBmi: Number(averageBmi.toFixed(2)),
                };
            })
            .filter(Boolean);

        const filteredRows = selectedSection === "all"
            ? normalizedRows
            : normalizedRows.filter((row) => row.sectionId === String(selectedSection));

        const monthlyMap = new Map();
        filteredRows.forEach((row) => {
            if (!monthlyMap.has(row.measurementMonth)) {
                monthlyMap.set(row.measurementMonth, {
                    measurementMonth: row.measurementMonth,
                    totalAverageBmi: 0,
                    rowCount: 0,
                });
            }

            const aggregate = monthlyMap.get(row.measurementMonth);
            aggregate.totalAverageBmi += row.averageBmi;
            aggregate.rowCount += 1;
        });

        return Array.from(monthlyMap.values())
            .sort((left, right) => left.measurementMonth.localeCompare(right.measurementMonth))
            .slice(-6)
            .map((row) => ({
                month: toMonthLabel(row.measurementMonth),
                averageBmi: Number((row.totalAverageBmi / Math.max(row.rowCount, 1)).toFixed(2)),
            }));
    }, [bmiTrendRows, selectedSection]);

    const parseHistoryArray = (value) => {
        if (Array.isArray(value)) {
            return value;
        }
        if (value == null) {
            return [];
        }
        const raw = String(value).trim();
        if (!raw) {
            return [];
        }
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch (error) {
            return [raw];
        }
    };

    const normalizeBmiStatus = (value) => {
        const status = String(value ?? "")
            .trim()
            .replace(/^"+|"+$/g, "")
            .toLowerCase();
        if (Object.prototype.hasOwnProperty.call(BMI_STATUS_RANK, status)) {
            return status;
        }
        return "";
    };

    // Improved = moved closer to Normal, declined = moved further away (or to the other side)
    const getUpdateStatus = (previousStatus, currentStatus) => {
        if (!previousStatus || !currentStatus || previousStatus === currentStatus) {
            return "stable";
        }
        const previousDistance = Math.abs(BMI_STATUS_RANK[previousStatus]);
        const currentDistance = Math.abs(BMI_STATUS_RANK[currentStatus]);
        if (previousDistance === currentDistance && BMI_STATUS_RANK[previousStatus] === BMI_STATUS_RANK[currentStatus]) {
            // Same band under a different name (e.g. old "underweight" and "wasted")
            return "stable";
        }
        if (currentDistance < previousDistance) {
            return "improved";
        }
        return "declined";
    };

    const getDaysAgoLabel = (value) => {
        if (!value) {
            return "-";
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return "-";
        }
        const diffMs = Math.max(0, Date.now() - parsed.getTime());
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (days <= 0) {
            return "Today";
        }
        if (days === 1) {
            return "1 day ago";
        }
        return `${days} days ago`;
    };

    const recentUpdates = useMemo(() => {
        const toNumber = (value) => {
            const parsed = Number(value);
            return Number.isNaN(parsed) ? null : Number(parsed.toFixed(1));
        };

        const updates = students
            .map((student, index) => {
                const studentId = student?.student_id ?? index;
                const firstName = student?.first_name ?? "";
                const lastName = student?.last_name ?? "";
                const bmiHistoryRaw = student?.bmi;
                const statusHistoryRaw = student?.bmi_measurement;
                const updatedAtRaw = student?.updated_at ?? "";

                const statusHistory = parseHistoryArray(statusHistoryRaw)
                    .map(normalizeBmiStatus)
                    .filter(Boolean);

                // Only include students that already have at least one update.
                if (statusHistory.length < 2) {
                    return null;
                }

                const bmiHistory = parseHistoryArray(bmiHistoryRaw);
                const previousStatus = statusHistory[statusHistory.length - 2];
                const currentStatus = statusHistory[statusHistory.length - 1];
                const previousBmi = toNumber(bmiHistory[bmiHistory.length - 2]);
                const currentBmi = toNumber(bmiHistory[bmiHistory.length - 1]);
                const updatedAtDate = new Date(updatedAtRaw);
                const updatedAtMs = Number.isNaN(updatedAtDate.getTime())
                    ? 0
                    : updatedAtDate.getTime();

                return {
                    id: `${studentId}_${updatedAtRaw}_${index}`,
                    name: `${firstName} ${lastName}`.trim() || "Unknown Student",
                    oldBMI: previousBmi != null ? previousBmi.toFixed(1) : "-",
                    newBMI: currentBmi != null ? currentBmi.toFixed(1) : "-",
                    status: getUpdateStatus(previousStatus, currentStatus),
                    date: getDaysAgoLabel(updatedAtRaw),
                    updatedAtMs,
                };
            })
            .filter(Boolean)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
            .slice(0, 20);

        return updates;
    }, [students]);

    const getCurrentDate = () => {
        const options = {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        };
        return new Date().toLocaleDateString("en-US", options);
    };

    // Navigation Links
    const linkNavigate = (num) => {
        // ? Note 1 = Dashboard, 2 = Profile, 3 = students, 4 = Feeding program
        let myLink = null
        if (num === 1) {
            return
        } else if (num === 2) {
            myLink = "Profile"
        } else if (num === 3) {
            myLink = "Students"
        } else if (num === 4) {
            myLink = "FeedingProgram"
        } else {
            myLink = "404"
        }

        navigate(`/${myLink}`)
    }

    const handleLogout = async () => {
        await logout();
        navigate("/");
    };

    const handleQuickAddFeedingSession = () => {
        navigate("/FeedingProgram", {
            state: { openCreateSession: true },
        });
    };

    const handleQuickUpdateMeasurement = () => {
        navigate("/Students", {
            state: { openMeasurementModal: true },
        });
    };

    // *Note: Teacher initials
    const getFirstLetters = (str) => {
        const words = str.split(' ');

        const firstLetters = words.map(word => {
            if (word.length > 0) {
            return word[0]; // Get the first character
            }
            return '';
        });
        return firstLetters.join(''); 
    }

    //* QUICK ACTIONS
    // const handleViewStudents = () => {

    // }

    // *CHECK IF THERE IS A USER LOGGED
    if (checkingAuth || (user?.id && !studentsFetchDone)) {
        return (
            <div className='comp-loading'>
                <Loading />
            </div>
        )
    }
    if (user == null) {
        return null;
    }

    return (
        <div className="dashboard-container">
            <Helmet>
                <title>Feeding Program | Dashboard</title>
            </Helmet>
            {/* Left Sidebar */}
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

                <nav className="dashboard-nav" onClick={() => linkNavigate(1)}>
                <button className="dashboard-nav-item active">
                    <svg
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                    />
                    </svg>
                    <span>Dashboard</span>
                </button>

                <button className="dashboard-nav-item" onClick={() => linkNavigate(2)}>
                    <svg
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    >
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
                    <svg
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    >
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
                    <svg
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                    </svg>
                    <span>Feeding Program</span>
                </button>

                {/* Opens the Tutorial page (a guide for teachers; it has no sidebar) */}
                <button className="dashboard-nav-item" onClick={() => navigate("/tutorial")}>
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
                    <span>Tutorial</span>
                </button>


                <button className="dashboard-nav-item dashboard-nav-logout" onClick={handleLogout}>
                    <svg
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    >
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
            <main className="dashboard-main">
                {/* Top Header */}
                <header className="dashboard-header">
                <div className="dashboard-header-left">
                    <select
                    className="dashboard-section-select"
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    >
                    <option value="all">All</option>
                    {sections.map((section) => (
                        <option key={section.id} value={section.id}>
                            {section.name}
                        </option>
                    ))}
                    </select>
                </div>

                <div className="dashboard-header-right">
                    <div className="dashboard-date">
                    <svg
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                    </svg>
                    <span>{getCurrentDate()}</span>
                    </div>
                    <div className="dashboard-teacher-info">
                    <div className="dashboard-teacher-avatar">{getFirstLetters(user.first_name)}</div>
                    <span className="dashboard-teacher-name">{teacherName}</span>
                    </div>
                </div>
                </header>

                {/* Dashboard Content */}
                <div className="dashboard-content">
                {/* Dashboard title */}
                <div className="dashboard-title">
                    <h1>Dashboard</h1>
                    <h5>Welcome {teacherName}!</h5>
                </div>
                {/* Summary Cards */}
                <div className="dashboard-summary">
                    <div className="dashboard-card">
                    <div className="dashboard-card-header">
                        <div className="dashboard-card-icon blue">
                        <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                            />
                        </svg>
                        </div>
                    </div>
                    <div className="dashboard-card-content">
                        <h3>{studentsInScope.length}</h3>
                        <p>Enrolled Students</p>
                    </div>
                    </div>

                    <div className="dashboard-card">
                    <div className="dashboard-card-header">
                        <div className="dashboard-card-icon orange">
                        <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                        </div>
                    </div>
                    <div className="dashboard-card-content">
                        <h3>{atRiskStudentsCount}</h3>
                        <p>At-Risk Students</p>
                    </div>
                    </div>

                    <div className="dashboard-card">
                    <div className="dashboard-card-header">
                        <div className="dashboard-card-icon green">
                        <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                        </svg>
                        </div>
                    </div>
                    <div className="dashboard-card-content">
                        <h3>
                        <span className={`dashboard-card-status ${nearestSessionStatus.kind}`}>
                            {nearestSessionStatus.kind === "today" && (
                                <svg
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    style={{ width: "1rem", height: "1rem" }}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                    />
                                </svg>
                            )}
                            {nearestSessionStatus.kind === "upcoming" && (
                                <svg
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    style={{ width: "1rem", height: "1rem" }}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                            )}
                            {nearestSessionStatus.kind === "empty" && (
                                <svg
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    style={{ width: "1rem", height: "1rem" }}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 12h8m8 0a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                            )}
                            {nearestSessionStatus.title}
                        </span>
                        </h3>
                        <p>{nearestSessionStatus.description}</p>
                    </div>
                    </div>

                    <div className="dashboard-card">
                    <div className="dashboard-card-header">
                        <div className="dashboard-card-icon purple">
                        <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                            />
                        </svg>
                        </div>
                    </div>
                    <div className="dashboard-card-content">
                        <h3>{totalCompletedSessions}</h3>
                        <p>Total Completed Sessions</p>
                    </div>
                    </div>
                </div>

                {/* Chart and Updates Section */}
                <div className="dashboard-chart-section">
                    {/* BMI Distribution Chart */}
                    <div className="dashboard-chart-card">
                    <div className="dashboard-chart-header">
                        <h3>BMI Distribution Trend</h3>
                        <p>Weekly progress for {selectedSectionLabel}</p>
                    </div>
                    {bmiData.length === 0 ? (
                        <div className="dashboard-chart-empty">No chart data yet.</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={bmiData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                            <YAxis stroke="#6b7280" fontSize={12} />
                            <Tooltip
                                contentStyle={{
                                backgroundColor: "#ffffff",
                                border: "1px solid #e5e7eb",
                                borderRadius: "0.5rem",
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: "14px" }} />
                            {visibleBmiSeries.map((series) => (
                                <Bar
                                    key={series.key}
                                    dataKey={series.key}
                                    fill={series.color}
                                    name={series.label}
                                    radius={[8, 8, 0, 0]}
                                />
                            ))}
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                    </div>

                    {/* Recent Updates */}
                    <div className="dashboard-updates-card">
                    <div className="dashboard-updates-header">
                        <h3>Recent BMI Updates</h3>
                        <p>Latest measurements accross <strong>all sections</strong></p>
                    </div>
                    <div className="dashboard-updates-list">
                        {recentUpdates.length === 0 ? (
                            <div className="dashboard-updates-empty">No updates yet.</div>
                        ) : (
                            recentUpdates.map((update) => (
                        <div key={update.id} className="dashboard-update-item">
                            <div className="dashboard-update-student">
                            {update.name}
                            </div>
                            <div className="dashboard-update-bmi">
                            {update.oldBMI} -&gt; {update.newBMI}
                            <span className={`dashboard-update-arrow ${update.status}`}>
                                {update.status === "improved" && (
                                <>
                                    <svg
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    style={{ width: "1rem", height: "1rem" }}
                                    >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 10l7-7m0 0l7 7m-7-7v18"
                                    />
                                    </svg>
                                    Improved
                                </>
                                )}
                                {update.status === "declined" && (
                                <>
                                    <svg
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    style={{ width: "1rem", height: "1rem" }}
                                    >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                                    />
                                    </svg>
                                    Needs Attention
                                </>
                                )}
                                {update.status === "stable" && (
                                <>
                                    <svg
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    style={{ width: "1rem", height: "1rem" }}
                                    >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 12h14"
                                    />
                                    </svg>
                                    Stable
                                </>
                                )}
                            </span>
                            </div>
                            <div className="dashboard-update-date">{update.date}</div>
                        </div>
                        ))
                        )}
                    </div>
                    </div>
                </div>

                <div className="dashboard-line-chart-card">
                    <div className="dashboard-chart-header">
                        <h3>BMI Average Trend</h3>
                        <p>Monthly average BMI for {selectedSectionLabel}</p>
                    </div>
                    {bmiLineData.length === 0 ? (
                        <div className="dashboard-chart-empty">No trend data yet.</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart
                                data={bmiLineData}
                                margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                                <YAxis stroke="#6b7280" fontSize={12} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#ffffff",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: "0.5rem",
                                    }}
                                    formatter={(value) => {
                                        const numericValue = Number(value);
                                        return [
                                            Number.isNaN(numericValue) ? "-" : numericValue.toFixed(2),
                                            "Average BMI",
                                        ];
                                    }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="averageBmi"
                                    stroke="#f97316"
                                    strokeWidth={3}
                                    dot={{ r: 4 }}
                                    activeDot={{ r: 6 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="dashboard-actions">
                    <div className="dashboard-actions-header">
                    <h3>Quick Actions</h3>
                    </div>
                    <div className="dashboard-actions-buttons">
                    <button className="dashboard-action-button" onClick={handleQuickAddFeedingSession}>
                        <div className="dashboard-action-button-icon">
                        <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                            />
                        </svg>
                        </div>
                        <span>Add Feeding Session</span>
                    </button>

                    <button className="dashboard-action-button" onClick={() => linkNavigate(3)}>
                        <div className="dashboard-action-button-icon">
                        <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                            />
                        </svg>
                        </div>
                        <span>View Students</span>
                    </button>

                                        <button className="dashboard-action-button" onClick={handleQuickUpdateMeasurement}>

                        <div className="dashboard-action-button-icon">
                        <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                            />
                        </svg>
                        </div>
                        <span>Update Measurement</span>
                    </button>
                    </div>
                </div>
                </div>
            </main>
            {/* <button onClick={handleMe}>click me</button> */}
    </div>
    )
}

export default Dashboard
