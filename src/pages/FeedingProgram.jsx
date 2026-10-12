import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles/FeedingProgramStyle.css";
import { useLocation, useNavigate } from "react-router";
import { Helmet } from "react-helmet";
// Token-aware axios: attaches the login token and renews it when it expires (see ../api.js)
import { authAxios as axios } from "../api";
import { apiFetch, initAuth, logout } from "../api";

// COMPONENTS
import Loading from '../components/Loading';

// Images
import Logo from "../images/logo.png";

// ==============================
// Date helpers (no libraries)
// ==============================
const pad2 = (n) => String(n).padStart(2, "0");

const toISODate = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const fromISODate = (iso) => {
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
};

const normalizeSessionDate = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";

  // Keep the UTC calendar date for timezone-aware strings
  // (e.g. "Sun, 15 Feb 2026 16:48:17 GMT") to avoid local TZ day shifts.
  const hasTimezone = /(gmt|utc|z|[+-]\d{2}:?\d{2})$/i.test(raw);
  if (hasTimezone) {
    return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
  }

  return toISODate(parsed);
};

const computeSessionStatus = (isoDate, dbStatus) => {
  const normalized = String(dbStatus || "").toLowerCase();
  if (normalized == "completed") return "completed";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  if (!isoDate) return "upcoming";
  const todayIso = toISODate(new Date());
  return isToday(fromISODate(isoDate))
    ? "today"
    : (fromISODate(isoDate) < fromISODate(todayIso) ? "pending" : "upcoming");
};

const isWeekday = (date) => {
  const day = new Date(date).getDay(); // 0 Sun ... 6 Sat
  return day >= 1 && day <= 5;
};

const isPast = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
};

const isToday = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() === today.getTime();
};

// Week key based on Mon–Fri locking (week starts Monday)
const startOfWeekMonday = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return d;
};

const weekKeyMon = (date) => {
  const start = startOfWeekMonday(date);
  return toISODate(start); // YYYY-MM-DD of Monday
};

const formatMonthYear = (year, monthIndex) => {
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const formatSessionDateLabel = (iso) => {
  const d = fromISODate(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

const formatDateLabel = (value) => {
  if (!value) return "No data";
  const raw = String(value).trim();
  if (!raw) return "No data";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return fromISODate(raw).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const truncateOneLine = (text, max = 38) => {
  const t = String(text || "").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

const uniqueId = (prefix = "id") => `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;

// ==============================
// Session foods (Go / Grow / Glow)
// Limits mirror the backend (server/session.py)
// ==============================
const FOOD_GROUPS = [
  { value: "go", label: "Go" },
  { value: "grow", label: "Grow" },
  { value: "glow", label: "Glow" },
  { value: "not_specified", label: "Not specified" },
];
const FOOD_GROUP_VALUES = FOOD_GROUPS.map((g) => g.value);
const MAX_FOODS_PER_SESSION = 20;
const FOOD_NAME_MIN_LENGTH = 2;
const FOOD_NAME_MAX_LENGTH = 100;
const FOOD_NAME_COUNTER_FROM = 80;

const createEmptyFood = () => ({ key: uniqueId("food"), name: "", group: "" });

const createEmptySessionForm = () => ({
  date: "",
  section_ids: [],
  sponsors_text: "",
  total_cost: "",
  foods: [createEmptyFood()],
});

// ==============================
// Session total cost (optional, PHP)
// Limits mirror the backend (server/session.py) and DECIMAL(10,2)
// ==============================
const MAX_TOTAL_COST = 99999999.99;

// Typing filter: digits, commas and a single decimal point
const sanitizeTotalCostInput = (value) => {
  const cleaned = String(value ?? "").replace(/[^\d.,]/g, "");
  const firstDot = cleaned.indexOf(".");
  return firstDot === -1
    ? cleaned
    : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
};

// Returns "" when valid (an empty value is allowed), otherwise an error message
const validateTotalCost = (value) => {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return "";
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return "Enter a valid amount, e.g. 1500 or 1500.50.";
  if ((text.split(".")[1] || "").length > 2) return "Use at most 2 decimal places.";
  if (Number(text) > MAX_TOTAL_COST) return "Maximum is ₱99,999,999.99.";
  return "";
};

// Form text -> number for the API, or null when empty
const parseTotalCost = (value) => {
  const text = String(value ?? "").replace(/,/g, "").trim();
  return text ? Number(text) : null;
};

// API value ("1500.00", number or null) -> number or null
const normalizeTotalCost = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

const formatPeso = (amount) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);

// Collapses repeated spaces and trims
const normalizeFoodName = (name) => String(name ?? "").replace(/\s+/g, " ").trim();

// Duplicate comparison key: ignores case, extra spaces and accents (same as the DB collation)
const foodNameKey = (name) =>
  normalizeFoodName(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const getFoodGroupLabel = (group) => FOOD_GROUPS.find((g) => g.value === group)?.label || "Not specified";

// Returns { isValid, listError, items: { [key]: { name, group } } }
const validateFoods = (foods) => {
  const items = {};
  const list = Array.isArray(foods) ? foods : [];
  let listError = "";

  if (list.length === 0) {
    listError = "Add at least one food.";
  } else if (list.length > MAX_FOODS_PER_SESSION) {
    listError = `A session can have at most ${MAX_FOODS_PER_SESSION} foods.`;
  }

  const seen = new Set();
  list.forEach((food) => {
    const errors = {};
    const name = normalizeFoodName(food.name);

    if (!name) {
      errors.name = "Enter a food name.";
    } else if (name.length < FOOD_NAME_MIN_LENGTH || name.length > FOOD_NAME_MAX_LENGTH) {
      errors.name = `Use ${FOOD_NAME_MIN_LENGTH}–${FOOD_NAME_MAX_LENGTH} characters.`;
    } else if (!/\p{L}/u.test(name)) {
      errors.name = "Enter a valid food name.";
    } else {
      const key = foodNameKey(name);
      if (seen.has(key)) {
        errors.name = "Already listed.";
      }
      seen.add(key);
    }

    if (!FOOD_GROUP_VALUES.includes(food.group)) {
      errors.group = "Choose Go, Grow, Glow or Not specified.";
    }

    if (errors.name || errors.group) {
      items[food.key] = errors;
    }
  });

  return { isValid: !listError && Object.keys(items).length === 0, listError, items };
};

// API foods -> [{ name, group }], with a fallback for old free-text records
const normalizeSessionFoods = (rawFoods, legacyText) => {
  if (Array.isArray(rawFoods) && rawFoods.length) {
    return rawFoods
      .map((food) => ({
        name: normalizeFoodName(food?.name ?? food?.food_name),
        group: FOOD_GROUP_VALUES.includes(food?.group ?? food?.food_group)
          ? (food?.group ?? food?.food_group)
          : "not_specified",
      }))
      .filter((food) => food.name);
  }

  const legacy = normalizeFoodName(legacyText);
  return legacy ? [{ name: legacy, group: "not_specified" }] : [];
};

// Groups foods in display order (Go → Grow → Glow → Not specified), keeping entered order inside a group
const groupSessionFoods = (foods) =>
  FOOD_GROUPS.map((group) => ({
    ...group,
    items: (foods || []).filter((food) => food.group === group.value),
  })).filter((group) => group.items.length > 0);

const getLastWeekdayOfMonth = (year, monthIndex, weekday) => {
  const d = new Date(year, monthIndex + 1, 0);
  d.setHours(0, 0, 0, 0);
  while (d.getDay() !== weekday) {
    d.setDate(d.getDate() - 1);
  }
  return d;
};

const buildPhilippineHolidayMap = (year) => {
  const map = new Map();

  const addHoliday = (date, name, type = "regular", shortLabel = "") => {
    map.set(toISODate(date), {
      name,
      type,
      shortLabel: shortLabel || name,
    });
  };

  // Regular holidays (nationwide)
  addHoliday(new Date(year, 0, 1), "New Year's Day");
  addHoliday(new Date(year, 3, 9), "Araw ng Kagitingan", "regular", "Day of Valor");
  addHoliday(new Date(year, 4, 1), "Labor Day");
  addHoliday(new Date(year, 5, 12), "Independence Day");
  addHoliday(getLastWeekdayOfMonth(year, 7, 1), "National Heroes Day");
  addHoliday(new Date(year, 10, 30), "Bonifacio Day");
  addHoliday(new Date(year, 11, 25), "Christmas Day");
  addHoliday(new Date(year, 11, 30), "Rizal Day");

  // Special non-working holidays (nationwide fixed dates)
  addHoliday(new Date(year, 1, 25), "EDSA People Power Revolution Anniversary", "special", "EDSA Day");
  addHoliday(new Date(year, 7, 21), "Ninoy Aquino Day");
  addHoliday(new Date(year, 10, 1), "All Saints' Day");
  addHoliday(new Date(year, 11, 8), "Feast of the Immaculate Conception", "special", "Immaculate Conception");
  addHoliday(new Date(year, 11, 31), "Last Day of the Year", "special", "Year End");

  return map;
};

const getPhilippineHolidayByISO = (iso) => {
  const raw = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }
  const year = parseInt(raw.slice(0, 4), 10);
  if (Number.isNaN(year)) {
    return null;
  }
  return buildPhilippineHolidayMap(year).get(raw) || null;
};


// ==============================
// Component
// ==============================
function FeedingProgram() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

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

  // NOTE: Keeping auth out for now to respect “no API calls”
  // TODO: Integrate initAuth() or existing auth flow here (client-side only)
  const teacherName = user?.first_name
        ? `${user.first_name} ${user.last_name}`
        : "Teacher";

  // Month state
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [monthCursor, setMonthCursor] = useState(() => ({
    year: today.getFullYear(),
    monthIndex: today.getMonth(), // 0..11
  }));

  // Data state
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);

  const [sessions, setSessions] = useState([]);

  // Attendance map:
  // attendanceBySession[session_id][student_id] = { present: 0|1, remarks: "" }
  const [attendanceBySession, setAttendanceBySession] = useState({});

  // Right panel form mode
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const [form, setForm] = useState(createEmptySessionForm);

  const [formErrors, setFormErrors] = useState({});
  // Food errors show after a field is left (touched) or after Save is pressed
  const [foodTouched, setFoodTouched] = useState({});
  const [foodsSubmitAttempted, setFoodsSubmitAttempted] = useState(false);
  const pendingFoodFocusKeyRef = useRef(null);

  // Attendance modal
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceSessionId, setAttendanceSessionId] = useState(null);
  const [attendanceActiveSectionId, setAttendanceActiveSectionId] = useState("");
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [attendanceSavedSections, setAttendanceSavedSections] = useState({});
  const [deletingSessionIds, setDeletingSessionIds] = useState({});
  const [isSavingSessionSubmit, setIsSavingSessionSubmit] = useState(false);
  const [sessionDetailsId, setSessionDetailsId] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Optional top filter (read-only per prompt)
  const [topFilter] = useState("All");

  useEffect(() => {
    if (!location.state?.openCreateSession) {
      return;
    }

    setEditingSessionId(null);
    setForm(createEmptySessionForm());
    setFormErrors({});
    setFoodTouched({});
    setFoodsSubmitAttempted(false);
    setIsPanelOpen(true);

    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  // ==========================
  // Derived data
  // ==========================
  const monthSessions = useMemo(() => {
    const { year, monthIndex } = monthCursor;
    const start = new Date(year, monthIndex, 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(year, monthIndex + 1, 1);
    end.setHours(0, 0, 0, 0);

    return sessions
      .filter((s) => {
        const d = fromISODate(s.date);
        return d >= start && d < end;
      })
      .sort((a, b) => fromISODate(b.date) - fromISODate(a.date));
  }, [sessions, monthCursor]);

  const sessionsByDate = useMemo(() => {
    const map = new Map();
    monthSessions.forEach((s) => {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date).push(s);
    });
    return map;
  }, [monthSessions]);

  const holidaysByDate = useMemo(() => {
    return buildPhilippineHolidayMap(monthCursor.year);
  }, [monthCursor.year]);

  const sectionLabelById = useMemo(() => {
    const m = new Map();
    sections.forEach((sec) => {
      m.set(sec.section_id, `${sec.grade_level} – ${sec.section_name}`);
    });
    return m;
  }, [sections]);

  const studentsBySection = useMemo(() => {
    const m = new Map();
    sections.forEach((sec) => m.set(String(sec.section_id ?? ""), []));
    students.forEach((stu) => {
      const key = String(stu.section_id ?? "");
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(stu);
    });
    // Sort per section
    m.forEach((arr) => arr.sort((a, b) => a.full_name.localeCompare(b.full_name)));
    return m;
  }, [students, sections]);

  const isEditing = Boolean(editingSessionId);

  const selectedSession = useMemo(() => {
    if (!editingSessionId) return null;
    return sessions.find((s) => s.session_id === editingSessionId) || null;
  }, [sessions, editingSessionId]);

  const sessionDetails = useMemo(() => {
    if (!sessionDetailsId) return null;
    return sessions.find((s) => s.session_id === sessionDetailsId) || null;
  }, [sessions, sessionDetailsId]);

  // Week-blocking: one session per Mon–Fri week
  const weekHasSession = useMemo(() => {
    // map weekKey -> session_ids (all sessions, not only month)
    const map = new Map();
    sessions.forEach((s) => {
      const wk = weekKeyMon(fromISODate(s.date));
      if (!map.has(wk)) map.set(wk, []);
      map.get(wk).push(s.session_id);
    });
    return map;
  }, [sessions]);

  // ==========================
  // Effects
  // ==========================
  // Removed dummy session seeding; sessions now come from the API.

  useEffect(() => {
    if (!user?.id) return;

    axios
      .get("/api/get_all_section", {
        params: {
          userId: user.id,
        },
      })
      .then((response) => {
        console.log("FeedingProgram sections:", response.data);
        const data = response.data;
        if (!data?.status) return;
        const list = Array.isArray(data.sections) ? data.sections : Array.isArray(data.result) ? data.result : [];
        const normalized = list.map((section, index) => {
          const grade = section?.grade ?? section?.grade_level ?? "";
          const name = section?.name ?? section?.section_name ?? "";
          const id =
            section?.section_id ??
            section?.id ??
            section?.sectionId ??
            section?.section_id ??
            (name || grade ? `${name}_${grade}`.replace(/\s+/g, "") : `sec_${index}`);
          return {
            ...section,
            id,
            name,
            grade,
            section_id: section?.section_id ?? id,
            section_name: section?.section_name ?? name,
            grade_level: section?.grade_level ?? grade,
          };
        });
        if (normalized.length) setSections(normalized);
      })
      .catch((error) => {
        console.error("Fetching sections error:", error);
      });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    axios
      .get("/api/get_all_students", {
        params: {
          userId: user.id,
        },
      })
      .then((response) => {
        const data = response.data;
        if (!data?.status) {
          setStudents([]);
          return;
        }
        const rawStudents = Array.isArray(data.students)
          ? data.students
          : Array.isArray(data.result)
            ? data.result
            : [];
        const normalized = rawStudents.map((stu, index) => {
          if (Array.isArray(stu)) {
            const [
              studentId,
              firstName,
              lastName,
              ,
              ,
              ,
              sectionId,
            ] = stu;
            return {
              student_id: studentId ?? index,
              full_name: `${firstName || ""} ${lastName || ""}`.trim(),
              section_id: String(sectionId ?? ""),
            };
          }
          const firstName = stu?.first_name ?? stu?.firstName ?? "";
          const lastName = stu?.last_name ?? stu?.lastName ?? "";
          return {
            student_id: stu?.student_id ?? stu?.id ?? index,
            full_name: `${firstName} ${lastName}`.trim(),
            section_id: String(stu?.section_id ?? stu?.sectionId ?? ""),
          };
        });
        setStudents(normalized);
        console.log(normalized)
      })
      .catch((error) => {
        console.error("Fetching students error:", error);
        setStudents([]);
      });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    axios
      .get("/api/get_all_session", {
        params: {
          userId: user.id,
        },
      })
      .then((response) => {
        console.log("FeedingProgram sessions:", response.data);
        const data = response.data;
        console.log(data);
        if (!data?.status) return;
        if (Array.isArray(data.sessions)) {
          const normalized = data.sessions.map((session, index) => {
            const isArray = Array.isArray(session);
            const rawDate = isArray
              ? session[2]
              : (session?.date ?? session?.session_date ?? session?.sessionDate ?? "");
            const isoDate = normalizeSessionDate(rawDate);
            const rawStatus = isArray
              ? session[3]
              : (session?.status ?? session?.session_status ?? session?.sessionStatus ?? "");
            const sectionIdsRaw = isArray
              ? session[4]
              : (session?.section_ids ?? session?.participating_section ?? session?.sections ?? []);
            let sectionIds = [];
            if (Array.isArray(sectionIdsRaw)) {
              sectionIds = sectionIdsRaw;
            } else if (typeof sectionIdsRaw === "string") {
              try {
                const parsed = JSON.parse(sectionIdsRaw);
                if (Array.isArray(parsed)) sectionIds = parsed;
              } catch (e) {
                sectionIds = [];
              }
            }
            const sponsorsText = isArray ? session[5] : (session?.sponsors_text ?? session?.sponsors ?? "");
            const foods = normalizeSessionFoods(
              isArray ? null : session?.foods,
              isArray ? session[6] : (session?.foods_serve ?? session?.foods_text ?? "")
            );
            const createdAtRaw = isArray
              ? session[7]
              : (session?.created_at ?? session?.createdAt ?? session?.date_created ?? "");
            console.log("created_at: ", createdAtRaw)
            const sessionId = isArray
              ? session[0]
              : (session?.session_id ?? session?.id ?? `sess_${index}`);
            const attendanceTaken = isArray
              ? Boolean(session[session.length - 1])
              : Boolean(session?.attendance_taken);
            return {
              ...(isArray ? {} : session),
              session_id: sessionId,
              date: isoDate || rawDate,
              status: computeSessionStatus(isoDate, rawStatus),
              attendance_taken: attendanceTaken,
              section_ids: sectionIds.map((sid) => String(sid)),
              sponsors_text: sponsorsText,
              total_cost: isArray ? null : normalizeTotalCost(session?.total_cost),
              foods,
              created_at: normalizeSessionDate(createdAtRaw) || createdAtRaw || "",
            };
          });
          console.log(normalized)
          setSessions(normalized);
          
        }
      })
      .catch((error) => {
        console.error("Fetching sessions error:", error);
      });
  }, [user?.id]);

  // ==========================
  // Navigation Links (same style as Students)
  // ==========================
  const linkNavigate = (num) => {
    // Note: 1 = Dashboard, 2 = Profile, 3 = Students, 4 = Feeding program
    let myLink = null;
    if (num === 1) myLink = "Dashboard";
    else if (num === 2) myLink = "Profile";
    else if (num === 3) myLink = "Students";
    else if (num === 4) return;
    else myLink = "404";
    navigate(`/${myLink}`);
  };

  const handleLogout = async () => {
      await logout();
      navigate("/");
  };

  // ==========================
  // Month controls
  // ==========================
  const handlePrevMonth = () => {
    setMonthCursor((prev) => {
      const d = new Date(prev.year, prev.monthIndex - 1, 1);
      return { year: d.getFullYear(), monthIndex: d.getMonth() };
    });
  };

  const handleNextMonth = () => {
    setMonthCursor((prev) => {
      const d = new Date(prev.year, prev.monthIndex + 1, 1);
      return { year: d.getFullYear(), monthIndex: d.getMonth() };
    });
  };

  // ==========================
  // Form handlers
  // ==========================
  const resetForm = () => {
    setEditingSessionId(null);
    setForm(createEmptySessionForm());
    setFormErrors({});
    setFoodTouched({});
    setFoodsSubmitAttempted(false);
  };

  const openCreate = () => {
    resetForm();
    setIsPanelOpen(true);
  };

  const openEdit = (sessionId) => {
    const s = sessions.find((x) => x.session_id === sessionId);
    if (!s) return;

    setEditingSessionId(sessionId);
    setForm({
      date: s.date,
      section_ids: [...(s.section_ids || [])],
      sponsors_text: s.sponsors_text || "",
      total_cost: s.total_cost !== null && s.total_cost !== undefined ? Number(s.total_cost).toFixed(2) : "",
      foods: (s.foods || []).length
        ? s.foods.map((food) => ({ key: uniqueId("food"), name: food.name, group: food.group }))
        : [createEmptyFood()],
    });
    setFormErrors({});
    setFoodTouched({});
    setFoodsSubmitAttempted(false);
    setIsPanelOpen(true);
  };

  const closePanel = () => {
    resetForm();
    setIsPanelOpen(false);
  };

  const openSessionDetails = (sessionId) => {
    setSessionDetailsId(sessionId);
  };

  const closeSessionDetails = () => {
    setSessionDetailsId(null);
  };

  const toggleSectionInForm = (sectionId) => {
    setForm((prev) => {
      const exists = prev.section_ids.includes(sectionId);
      const next = exists ? prev.section_ids.filter((x) => x !== sectionId) : [...prev.section_ids, sectionId];
      return { ...prev, section_ids: next };
    });

    setFormErrors((prev) => ({ ...prev, section_ids: "" }));
  };

  // ==========================
  // Foods Served (Go / Grow / Glow pairs)
  // ==========================
  const foodValidation = useMemo(() => validateFoods(form.foods), [form.foods]);

  const getVisibleFoodError = (foodKey, field) => {
    if (!foodsSubmitAttempted && !foodTouched[`${foodKey}.${field}`]) return "";
    return foodValidation.items[foodKey]?.[field] || "";
  };

  const handleFoodChange = (foodKey, field, value) => {
    setForm((prev) => ({
      ...prev,
      foods: prev.foods.map((food) => (food.key === foodKey ? { ...food, [field]: value } : food)),
    }));
    setFormErrors((prev) => ({ ...prev, foods: "" }));
  };

  const handleFoodBlur = (foodKey, field) => {
    setFoodTouched((prev) => ({ ...prev, [`${foodKey}.${field}`]: true }));
  };

  const handleAddFood = () => {
    if (form.foods.length >= MAX_FOODS_PER_SESSION) return;
    const newFood = createEmptyFood();
    pendingFoodFocusKeyRef.current = newFood.key;
    setForm((prev) => ({ ...prev, foods: [...prev.foods, newFood] }));
  };

  const handleRemoveFood = (foodKey) => {
    // The last remaining pair can't be removed
    if (form.foods.length <= 1) return;
    setForm((prev) => ({ ...prev, foods: prev.foods.filter((food) => food.key !== foodKey) }));
    setFoodTouched((prev) => {
      const next = { ...prev };
      delete next[`${foodKey}.name`];
      delete next[`${foodKey}.group`];
      return next;
    });
  };

  // Focus the name input of a newly added pair
  useEffect(() => {
    const key = pendingFoodFocusKeyRef.current;
    if (!key) return;
    pendingFoodFocusKeyRef.current = null;
    document.getElementById(`food-name-${key}`)?.focus();
  }, [form.foods]);

  const validateSessionForm = () => {
    const errors = {};
    const iso = String(form.date || "").trim();

    if (!iso) {
      errors.date = "Please select a date.";
    } else {
      const d = fromISODate(iso);
      const holiday = getPhilippineHolidayByISO(iso);

      if (isPast(d)) {
        errors.date = "Past dates are not allowed.";
      } else if (holiday) {
        errors.date = `The chosen date is a holiday (${holiday.name}). Please select another date.`;
      } else if (!isWeekday(d)) {
        errors.date = "Only weekdays (Mon–Fri) are allowed.";
      } else {
        // Enforce one session per week
        const wk = weekKeyMon(d);
        const ids = weekHasSession.get(wk) || [];
        const blockedByOther =
          ids.length > 0 && !(isEditing && ids.length === 1 && ids[0] === editingSessionId) && !(isEditing && ids.includes(editingSessionId));

        if (blockedByOther) {
          errors.date = "A session already exists in that week (Mon–Fri). Please choose another week.";
        }
      }
    }

    if (!form.section_ids || form.section_ids.length === 0) {
      errors.section_ids = "Please select at least one section.";
    }

    const totalCostError = validateTotalCost(form.total_cost);
    if (totalCostError) {
      errors.total_cost = totalCostError;
    }

    if (!foodValidation.isValid) {
      errors.foods = foodValidation.listError || "Please fix the highlighted foods.";
    }

    setFormErrors(errors);
    setFoodsSubmitAttempted(true);

    const isValid = Object.keys(errors).length === 0;
    if (!isValid) {
      // Bring the first error into view
      requestAnimationFrame(() => {
        document
          .querySelector(".feeding-right-panel .feeding-form-error")
          ?.closest(".feeding-form-field")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
    return isValid;
  };

  const deriveStatus = (iso, currentStatus) => {
    // Keep cancelled if already cancelled unless user changes it via action
    if (currentStatus === "cancelled") return "cancelled";
    if (currentStatus === "completed") return "completed";

    const d = fromISODate(iso);
    if (isToday(d)) return "today";
    if (isPast(d)) return "pending";
    return "upcoming";
  };

  const triggerToast = (message) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleSaveSession = () => {
    if (isSavingSessionSubmit) return;
    if (!validateSessionForm()) return;

    const payload = {
      userId: user.id,
      date: String(form.date || "").trim(),
      section_ids: Array.isArray(form.section_ids) ? [...form.section_ids] : [],
      sponsors_text: String(form.sponsors_text || "").trim(),
      total_cost: parseTotalCost(form.total_cost),
      foods: form.foods.map((food) => ({ name: normalizeFoodName(food.name), group: food.group })),
    };

    if (!payload.date || payload.section_ids.length === 0) {
      return;
    }

    if (!isEditing) {
      setIsSavingSessionSubmit(true);
      // NOTE: Validate week-blocking on backend too
      axios
        .post("/api/add_session", payload)
        .then((response) => {
          console.log("add_session:", response.data);
          const status = response.data?.status;
          if (!status) {
            alert(response.data?.message || "Something went wrong. Try again later!");
            return;
          }

          const newSession = {
            session_id: response.data?.session_id ?? uniqueId("sess"),
            date: payload.date,
            status: deriveStatus(payload.date, "upcoming"),
            section_ids: [...payload.section_ids],
            sponsors_text: payload.sponsors_text,
            total_cost: payload.total_cost,
            foods: payload.foods,
            created_at: toISODate(new Date()),
          };

          setSessions((prev) => [...prev, newSession]);
          triggerToast("Session created successfully!");
          closePanel();
        })
        .catch((error) => {
          console.error("Add session error:", error);
          alert("An error occurred while saving the session.");
        })
        .finally(() => {
          setIsSavingSessionSubmit(false);
        });
      return;
    }

    if (!editingSessionId) return;
    
    const updatePayload = {
      ...payload,
      sessionId: editingSessionId,
    };

    console.log(updatePayload)

    setIsSavingSessionSubmit(true);
    axios
      .post("/api/update_session_information", updatePayload)
      .then((response) => {
        const status = response.data?.status;
        if (!status) {
          alert(response.data?.message || "Something went wrong. Try again later!");
          return;
        }

        setSessions((prev) =>
          prev.map((s) => {
            if (s.session_id !== editingSessionId) return s;
            return {
              ...s,
              date: payload.date,
              section_ids: [...payload.section_ids],
              sponsors_text: payload.sponsors_text,
              total_cost: payload.total_cost,
              foods: payload.foods,
              created_at: s.created_at,
              status: deriveStatus(payload.date, s.status),
            };
          })
        );

        triggerToast("Session updated successfully!");
        closePanel();
      })
      .catch((error) => {
        console.error("Update session error:", error);
        alert("An error occurred while updating the session.");
      })
      .finally(() => {
        setIsSavingSessionSubmit(false);
      });
  };

  const handleDeleteSession = (sessionId) => {
    if (deletingSessionIds[sessionId]) return;
    const ok = window.confirm("Delete this session? This cannot be undone.");
    if (!ok) return;

    if (!user?.id) {
      alert("Missing user info. Please try again.");
      return;
    }

    setDeletingSessionIds((prev) => ({ ...prev, [sessionId]: true }));
    axios
      .delete("/api/delete_session", {
        data: {
          userId: user.id,
          sessionId,
        },
      })
      .then((response) => {
        const status = response.data?.status;
        if (!status) {
          alert("Something went wrong. Try again later!");
          return;
        }

        setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
        setAttendanceBySession((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });

        if (editingSessionId === sessionId) closePanel();
        triggerToast("Session deleted successfully!");
      })
      .catch((error) => {
        console.error("Delete session error:", error);
        alert("An error occurred while deleting the session.");
      })
      .finally(() => {
        setDeletingSessionIds((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      });
  };

  const handleMarkCompleted = (sessionId) => {
    for (let i = 0; i < sessions.length; i++) {
      if (sessions[i].session_id == sessionId && sessions[i].status == "completed") {
        alert("already marked completed.")
        return;
      }
    }

    console.log(sessionId)

    const ok = window.confirm("Mark as complete?");
    if (!ok) return;

    if (!user?.id) {
      alert("Missing user info. Please try again.");
      return;
    }

    axios
      .post("/api/set_complete_session", {
        userId: user.id,
        sessionId: sessionId,
      })
      .then((response) => {
        const status = response.data?.status;
        if (!status) {
          alert("Something went wrong. Try again later!");
          return;
        }
        setSessions((prev) => prev.map((s) => (s.session_id === sessionId ? { ...s, status: "completed" } : s)));
        closePanel();
        triggerToast("Session marked as completed!");
      })
      .catch((error) => {
        console.error("Cancel session error:", error);
        alert("An error occurred while marking as complete the session.");
      });
  };

  const handleCancelSession = (sessionId) => {
    const ok = window.confirm("Cancel this session? This cannot be undone.");
    if (!ok) return;
    if (!user?.id) {
      alert("Missing user info. Please try again.");
      return;
    }

    console.log(user.id, sessionId)

    axios
      .post("/api/set_cancel_session", {
        userId: user.id,
        sessionId: sessionId,
      })
      .then((response) => {
        const status = response.data?.status;
        if (!status) {
          alert("Something went wrong. Try again later!");
          return;
        }
        setSessions((prev) => prev.map((s) => (s.session_id === sessionId ? { ...s, status: "cancelled" } : s)));
        closePanel();
        triggerToast("Session cancelled successfully!");
      })
      .catch((error) => {
        console.error("Cancel session error:", error);
        alert("An error occurred while cancelling the session.");
      });
  };

  // ==========================
  // Attendance
  // ==========================
  const getSessionStudents = (session) => {
    const secIds = session.section_ids || [];
    const all = [];
    secIds.forEach((sid) => {
      const arr = studentsBySection.get(sid) || [];
      arr.forEach((stu) => all.push(stu));
    });
    return all;
  };

  const ensureAttendanceShape = (sessionId) => {
    const session = sessions.find((s) => s.session_id === sessionId);
    if (!session) return;

    setAttendanceBySession((prev) => {
      const existing = prev[sessionId] || {};
      const next = { ...existing };

      const allStudents = getSessionStudents(session);
      allStudents.forEach((stu) => {
        if (!next[stu.student_id]) {
          next[stu.student_id] = { present: 1, remarks: "" }; // default present
        }
      });

      return { ...prev, [sessionId]: next };
    });
  };

  const openAttendance = (sessionId) => {
    setAttendanceSessionId(sessionId);
    ensureAttendanceShape(sessionId);

    const s = sessions.find((x) => x.session_id === sessionId);
    const firstSection = s?.section_ids?.[0] || "";
    setAttendanceActiveSectionId(String(firstSection));

    setAttendanceOpen(true);
  };

  const closeAttendance = () => {
    setAttendanceOpen(false);
    setAttendanceSessionId(null);
    setAttendanceActiveSectionId("");
  };

  const attendanceForSession = attendanceSessionId ? attendanceBySession[attendanceSessionId] || {} : {};

  const attendanceSession = useMemo(() => {
    if (!attendanceSessionId) return null;
    return sessions.find((s) => s.session_id === attendanceSessionId) || null;
  }, [attendanceSessionId, sessions]);

  const attendanceSections = attendanceSession?.section_ids || [];
  const activeSectionSaved = Boolean(
    attendanceSession?.attendance_taken ||
      (attendanceSavedSections[attendanceSessionId] && attendanceSavedSections[attendanceSessionId].has(attendanceActiveSectionId))
  );

  const attendanceStudentsCurrentSection = useMemo(() => {
    if (!attendanceActiveSectionId) return [];

    console.log(studentsBySection)
    return studentsBySection.get(attendanceActiveSectionId) || [];
  }, [attendanceActiveSectionId, studentsBySection]);

  const computeAttendanceCounts = (sessionId, sectionId) => {
    const session = sessions.find((s) => s.session_id === sessionId);
    if (!session) return { present: 0, absent: 0, total: 0 };

    const stuList = (studentsBySection.get(sectionId) || []).filter((stu) => session.section_ids.includes(stu.section_id));
    let present = 0;
    let absent = 0;

    stuList.forEach((stu) => {
      const rec = (attendanceBySession[sessionId] || {})[stu.student_id];
      if (rec?.present === 1) present += 1;
      else absent += 1;
    });

    return { present, absent, total: stuList.length };
  };

  const markAllPresent = () => {
    if (!attendanceSessionId || !attendanceActiveSectionId) return;

    const sectionStudents = attendanceStudentsCurrentSection;
    setAttendanceBySession((prev) => {
      const current = prev[attendanceSessionId] || {};
      const next = { ...current };

      sectionStudents.forEach((stu) => {
        next[stu.student_id] = { ...(next[stu.student_id] || { present: 1, remarks: "" }), present: 1 };
      });

      return { ...prev, [attendanceSessionId]: next };
    });
  };

  //* ATTENDANCE FUNCTION
  const togglePresent = (studentId) => {
    if (!attendanceSessionId) return;

    setAttendanceBySession((prev) => {
      const current = prev[attendanceSessionId] || {};
      const rec = current[studentId] || { present: 1, remarks: "" };
      const nextRec = { ...rec, present: rec.present === 1 ? 0 : 1 };
      return { ...prev, [attendanceSessionId]: { ...current, [studentId]: nextRec } };
    });

    console.log(attendanceBySession)
  };

  const updateRemarks = (studentId, value) => {
    if (!attendanceSessionId) return;

    setAttendanceBySession((prev) => {
      const current = prev[attendanceSessionId] || {};
      const rec = current[studentId] || { present: 1, remarks: "" };
      const nextRec = { ...rec, remarks: value };
      return { ...prev, [attendanceSessionId]: { ...current, [studentId]: nextRec } };
    });
  };

  const saveAttendance = () => {
    // TODO: Attendance Should be ineditable. If attendance was already listed on a session the attendance button should be dissabled.
    if (isSavingAttendance) return;
    if (!attendanceSessionId || !attendanceSession) {
      closeAttendance();
      return;
    }

    const sectionLabel = sectionLabelById.get(attendanceActiveSectionId) || attendanceActiveSectionId;
    const ok = window.confirm(`You cannot edit this later. Save Attendance for ${sectionLabel}?`);
    if (!ok) return;

    const map = attendanceBySession[attendanceSessionId] || {};
    const studentsList = attendanceStudentsCurrentSection;
    const payload = studentsList.map((stu) => {
      const rec = map[stu.student_id] || { present: 0, remarks: "" };
      return {
        session_id: attendanceSessionId,
        section_id: attendanceActiveSectionId,
        student_id: stu.student_id,
        full_name: stu.full_name,
        present: rec.present,
        remarks: rec.remarks,
      };
    });

    setIsSavingAttendance(true);
    axios
      .post("/api/add_students_attendance", { attendance: payload })
      .then((response) => {
        const status = response.data?.status;
        if (!status) {
          alert("Something went wrong. Try again later!");
          return;
        }
        setAttendanceSavedSections((prev) => {
          const next = { ...prev };
          const current = next[attendanceSessionId] ? new Set(next[attendanceSessionId]) : new Set();
          current.add(String(attendanceActiveSectionId));
          next[attendanceSessionId] = current;

          const session = sessions.find((s) => s.session_id === attendanceSessionId);
          const sectionCount = session?.section_ids?.length || 0;
          const savedCount = current.size;
          if (sectionCount > 0 && savedCount >= sectionCount) {
            setSessions((prevSessions) =>
              prevSessions.map((s) => (s.session_id === attendanceSessionId ? { ...s, attendance_taken: true } : s))
            );
          }

          return next;
        });
        triggerToast("Attendance saved successfully!");
        console.log("attendance payload:", payload);
        closeAttendance();
      })
      .catch((error) => {
        console.error("Save attendance error:", error);
        alert("An error occurred while saving attendance.");
      })
      .finally(() => {
        setIsSavingAttendance(false);
      });
  };

  const attendanceDoneForSession = (session) => {
    const map = attendanceBySession[session.session_id];
    if (!map) return false;

    const list = getSessionStudents(session);
    if (list.length === 0) return false;

    return list.every((stu) => Boolean(map[stu.student_id]));
  };

  // ==========================
  // Calendar grid
  // ==========================
  const calendarGrid = useMemo(() => {
    const { year, monthIndex } = monthCursor;
    const first = new Date(year, monthIndex, 1);
    const last = new Date(year, monthIndex + 1, 0);

    first.setHours(0, 0, 0, 0);
    last.setHours(0, 0, 0, 0);

    // We render Sun–Sat headers like your mock
    const startDayOfWeek = first.getDay(); // 0..6 (Sun..Sat)
    const totalDays = last.getDate();

    const cells = [];
    for (let i = 0; i < startDayOfWeek; i += 1) {
      cells.push({ type: "empty", key: `empty_${i}` });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const d = new Date(year, monthIndex, day);
      d.setHours(0, 0, 0, 0);
      const iso = toISODate(d);

      cells.push({
        type: "day",
        key: iso,
        dayNumber: day,
        iso,
        isToday: isToday(d),
      });
    }

    return cells;
  }, [monthCursor]);

  // ==========================
  // Render helpers
  // ==========================
  const getStatusLabel = (status) => {
    if (status === "completed") return "Completed";
    if (status === "cancelled") return "Cancelled";
    if (status === "today") return "Today";
    if (status === "pending") return "Pending"
    return "Upcoming";
  };

  const getStatusClass = (status) => {
    if (status === "completed") return "completed";
    if (status === "cancelled") return "cancelled";
    if (status === "today") return "today";
    return "upcoming";
  };

  const getSessionSectionsLabel = (session) => {
    const ids = session.section_ids || [];
    return ids.map((id) => sectionLabelById.get(id) || id);
  };

  // ==========================
  // UI
  // ==========================
  if (checkingAuth) {
    return (
      <div className='comp-loading'>
        <Loading />
      </div>
    );
  }
  if (user == null) {
    return null;
  }

  return (
    <div className="feeding-container">
      <Helmet>
        <title>Feeding Program | Sessions</title>
      </Helmet>

      {/* Left Sidebar (copied pattern; only active state differs) */}
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

          <button className="dashboard-nav-item" onClick={() => linkNavigate(2)}>
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

          <button className="dashboard-nav-item active" onClick={() => linkNavigate(4)}>
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

      {/* Main */}
      <div className="feeding-main">
        {/* Header */}
        <header className="feeding-header">
          <div className="feeding-header-top">
            <div className="feeding-header-left">
              <h1>Feeding Program</h1>
              <p className="feeding-header-subtitle">Signed in as {teacherName}</p>
            </div>

            <div className="feeding-header-right">
              <div className="feeding-month-nav">
                <button className="feeding-month-btn" onClick={handlePrevMonth} aria-label="Previous month">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="feeding-month-label">{formatMonthYear(monthCursor.year, monthCursor.monthIndex)}</div>
                <button className="feeding-month-btn" onClick={handleNextMonth} aria-label="Next month">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="feeding-content">
          {/* Left column */}
          <div className="feeding-left-col">
            {/* Sessions list card */}
            <div className="feeding-card">
              <div className="feeding-card-header">
                <h2>Feeding Sessions — {formatMonthYear(monthCursor.year, monthCursor.monthIndex)}</h2>
                <button className="feeding-ghost-btn" onClick={openCreate}>
                  Create new
                </button>
              </div>

              <div className="feeding-session-table">
                <div className="feeding-session-table-head">
                  <div>Date</div>
                  <div>Status</div>
                  <div>Sections</div>
                  <div>Sponsors</div>
                  <div>Foods</div>
                  <div className="right">Actions</div>
                </div>
                {monthSessions.length === 0 ? (
                  <div className="feeding-empty">
                    <h3>No sessions for this month</h3>
                    <p>Create a session using the panel on the right.</p>
                  </div>
                ) : (
                  monthSessions.map((s) => {
                    const sectionsLabel = getSessionSectionsLabel(s);
                    const attendanceDone = attendanceDoneForSession(s);
                    return (
                      
                      <div
                        className="feeding-session-row"
                        key={s.session_id}
                        onClick={() => openSessionDetails(s.session_id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openSessionDetails(s.session_id);
                          }
                        }}
                      >
                        <div className="feeding-session-date">
                          <div className="primary">{formatSessionDateLabel(s.date)}</div>
                          <div className="secondary">{attendanceDone ? "Attendance: Done" : "Attendance: Not yet"}</div>
                        </div>

                        <div>
                          <span className={`feeding-status-pill ${getStatusClass(s.status)}`}>
                            {getStatusLabel(s.status)}
                          </span>
                        </div>

                        <div className="feeding-session-sections">
                          {sectionsLabel.slice(0, 2).map((lbl) => (
                            <span className="feeding-chip" key={lbl}>
                              {lbl}
                            </span>
                          ))}
                          {sectionsLabel.length > 2 && <span className="feeding-chip subtle">+{sectionsLabel.length - 2}</span>}
                        </div>

                        <div className="feeding-session-text">
                          {truncateOneLine(s.sponsors_text, 34) || <span className="muted">—</span>}
                        </div>

                        <div
                          className="feeding-session-text feeding-session-foods"
                          title={(s.foods || []).map((food) => `${food.name} (${getFoodGroupLabel(food.group)})`).join(", ")}
                        >
                          {(s.foods || []).length ? (
                            s.foods.map((food, index) => (
                              <span className="feeding-food-inline" key={`${food.name}-${index}`}>
                                <span className={`feeding-food-dot ${food.group}`} aria-hidden="true" />
                                <span className="feeding-visually-hidden">{getFoodGroupLabel(food.group)}: </span>
                                {food.name}
                                {index < s.foods.length - 1 ? <span className="feeding-visually-hidden">, </span> : null}
                              </span>
                            ))
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </div>

                        <div className="feeding-session-actions">
                          {s.status === "completed" ? (
                            <button
                              className="feeding-icon-btn danger"
                              title="Delete Session"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSession(s.session_id);
                              }}
                              disabled={Boolean(deletingSessionIds[s.session_id])}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          ) : (
                            <button
                              className="feeding-icon-btn"
                              title="Edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(s.session_id);
                              }}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                          )}

                          <button
                            className="feeding-action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (s.status !== "completed") {
                                alert("Session must first be completed before taking attendance.");
                                return;
                              }
                              openAttendance(s.session_id);
                            }}
                          >
                            {s.attendance_taken ? "View Attendance" : "Take Attendance"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Calendar card */}
            <div className="feeding-card">
              <div className="feeding-card-header">
                <h2>Feeding Program Calendar — {formatMonthYear(monthCursor.year, monthCursor.monthIndex)}</h2>
                <div className="feeding-card-subtext">Click an event chip to edit the session.</div>
              </div>

              <div className="feeding-calendar">
                <div className="feeding-calendar-head">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="feeding-calendar-dow">
                      {d}
                    </div>
                  ))}
                </div>

                <div className="feeding-calendar-grid">
                  {calendarGrid.map((cell) => {
                    if (cell.type === "empty") {
                      return <div key={cell.key} className="feeding-calendar-cell empty" />;
                    }

                    const daySessions = sessionsByDate.get(cell.iso) || [];
                    const holiday = holidaysByDate.get(cell.iso);
                    return (
                      <div
                        key={cell.key}
                        className={`feeding-calendar-cell ${cell.isToday ? "today" : ""} ${holiday ? "holiday" : ""}`}
                      >
                        <div className="feeding-calendar-dayhead">
                          <div className="feeding-calendar-daynum">{cell.dayNumber}</div>
                          {holiday ? (
                            <span
                              className={`feeding-holiday-tag ${holiday.type === "special" ? "special" : ""}`}
                              title={holiday.name}
                            >
                              {holiday.shortLabel}
                            </span>
                          ) : null}
                        </div>

                        <div className="feeding-calendar-events">
                          {daySessions.slice(0, 3).map((s) => (
                            <button
                              key={s.session_id}
                              className={`feeding-event-chip ${getStatusClass(s.status)}`}
                              onClick={() => openEdit(s.session_id)}
                              type="button"
                            >
                              Event
                            </button>
                          ))}
                          {daySessions.length > 3 && (
                            <div className="feeding-event-more">+{daySessions.length - 3} more</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right column (Create/Edit panel) */}
          {isPanelOpen ? (
            <aside className="feeding-right-panel">
              <div className={`feeding-panel-content ${isEditing ? "is-editing" : ""}`}>
                <div className="feeding-panel-header">
                  <div className="feeding-panel-title-row">
                    <h2>{isEditing ? "Edit Session" : "Create Session"}</h2>
                    <button className="feeding-panel-close" onClick={closePanel} type="button" aria-label="Close session panel">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p>Choose one weekday (Mon–Fri). One session per week.</p>
                </div>

                <div className="feeding-form">
                <div className="feeding-form-field">
                  <label className="feeding-form-label required">Date</label>
                  <input
                    type="date"
                    className={`feeding-form-input ${formErrors.date ? "error" : ""}`}
                    value={form.date}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, date: e.target.value }));
                      setFormErrors((prev) => ({ ...prev, date: "" }));
                    }}
                    min={toISODate(today)}
                  />
                  <div className="feeding-form-hint">Choose one weekday (Mon–Fri). Past dates are disabled.</div>
                  {formErrors.date ? <div className="feeding-form-error">{formErrors.date}</div> : null}
                </div>

                <div className="feeding-form-field">
                  <label className="feeding-form-label required">Participating Sections</label>

                <div className="feeding-checkbox-list">
                  {sections.length === 0 ? (
                    <div className="feeding-empty small">
                      <h3>No sections available</h3>
                      <p>
                        Please create one in{" "}
                        <button type="button" className="feeding-link" onClick={() => navigate("/Students")}>
                          Students
                        </button>
                        .
                      </p>
                    </div>
                  ) : (
                    sections.map((sec) => {
                      const checked = form.section_ids.includes(sec.section_id);
                      const gradeLabel = sec.grade ?? sec.grade_level ?? "";
                      const nameLabel = sec.name ?? sec.section_name ?? "";
                      return (
                        <label key={sec.section_id} className="feeding-checkbox-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSectionInForm(sec.section_id)}
                          />
                          <span>{gradeLabel} - {nameLabel}</span>
                        </label>
                      );
                    })
                  )}
                </div>

                  {formErrors.section_ids ? <div className="feeding-form-error">{formErrors.section_ids}</div> : null}
                </div>

                <div className="feeding-form-field">
                  <label className="feeding-form-label">Sponsors</label>
                  <textarea
                    className="feeding-form-textarea"
                    value={form.sponsors_text}
                    onChange={(e) => setForm((prev) => ({ ...prev, sponsors_text: e.target.value }))}
                    placeholder="School MOOE, Barangay Health Office, PTA, Mr. Juan Dela Cruz"
                    rows={3}
                  />
                </div>

                <div className="feeding-form-field">
                  <label className="feeding-form-label" htmlFor="feeding-total-cost">Total Cost (₱)</label>
                  <input
                    id="feeding-total-cost"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className={`feeding-form-input ${formErrors.total_cost ? "error" : ""}`}
                    value={form.total_cost}
                    onChange={(e) => {
                      const value = sanitizeTotalCostInput(e.target.value);
                      setForm((prev) => ({ ...prev, total_cost: value }));
                      setFormErrors((prev) => ({ ...prev, total_cost: "" }));
                    }}
                    placeholder="e.g. 1500.00"
                    aria-invalid={Boolean(formErrors.total_cost)}
                  />
                  <div className="feeding-form-hint">Optional. Total expense for this feeding session.</div>
                  {formErrors.total_cost ? <div className="feeding-form-error">{formErrors.total_cost}</div> : null}
                </div>

                <div className="feeding-form-field">
                  <label className="feeding-form-label required" id="feeding-foods-label">Foods Served</label>

                  <div className="feeding-food-list" role="group" aria-labelledby="feeding-foods-label">
                    {form.foods.map((food, index) => {
                      const nameError = getVisibleFoodError(food.key, "name");
                      const groupError = getVisibleFoodError(food.key, "group");
                      const nameLength = food.name.length;
                      return (
                        <div key={food.key} className={`feeding-food-row ${food.group ? `group-${food.group}` : ""}`}>
                          <input
                            id={`food-name-${food.key}`}
                            type="text"
                            className={`feeding-form-input ${nameError ? "error" : ""}`}
                            value={food.name}
                            maxLength={FOOD_NAME_MAX_LENGTH}
                            placeholder="Food name, e.g. Rice"
                            aria-label={`Food ${index + 1} name`}
                            aria-invalid={Boolean(nameError)}
                            onChange={(e) => handleFoodChange(food.key, "name", e.target.value)}
                            onBlur={() => handleFoodBlur(food.key, "name")}
                          />
                          {nameError ? <div className="feeding-form-error">{nameError}</div> : null}
                          {nameLength >= FOOD_NAME_COUNTER_FROM ? (
                            <div className="feeding-form-hint">{nameLength}/{FOOD_NAME_MAX_LENGTH} characters</div>
                          ) : null}

                          <div className="feeding-food-row-controls">
                            <select
                              className={`feeding-form-input feeding-form-select ${groupError ? "error" : ""}`}
                              value={food.group}
                              aria-label={`Food ${index + 1} group`}
                              aria-invalid={Boolean(groupError)}
                              onChange={(e) => handleFoodChange(food.key, "group", e.target.value)}
                              onBlur={() => handleFoodBlur(food.key, "group")}
                            >
                              <option value="">Select group</option>
                              {FOOD_GROUPS.map((group) => (
                                <option key={group.value} value={group.value}>
                                  {group.label}
                                </option>
                              ))}
                            </select>
                            {form.foods.length > 1 ? (
                              <button
                                type="button"
                                className="feeding-icon-btn danger"
                                onClick={() => handleRemoveFood(food.key)}
                                title="Remove food"
                                aria-label={`Remove food ${index + 1}`}
                              >
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            ) : null}
                          </div>
                          {groupError ? <div className="feeding-form-error">{groupError}</div> : null}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="feeding-ghost-btn feeding-food-add"
                    onClick={handleAddFood}
                    disabled={form.foods.length >= MAX_FOODS_PER_SESSION}
                  >
                    + Add food
                  </button>
                  <div className="feeding-form-hint">
                    {form.foods.length >= MAX_FOODS_PER_SESSION
                      ? `Maximum of ${MAX_FOODS_PER_SESSION} foods per session.`
                      : "Choose Go, Grow, Glow or Not specified for each food."}
                  </div>
                  {formErrors.foods ? <div className="feeding-form-error">{formErrors.foods}</div> : null}
                </div>

                {isEditing && editingSessionId ? (
                  <div className="feeding-edit-actions">
                    <button
                      className="feeding-action-btn subtle"
                      onClick={() => handleMarkCompleted(editingSessionId)}
                      type="button"
                    >
                      Mark Completed
                    </button>
                    <button
                      className="feeding-link danger"
                      onClick={() => handleCancelSession(editingSessionId)}
                      type="button"
                    >
                      Cancel Session
                    </button>
                    <button
                      className="feeding-link danger"
                      onClick={() => handleDeleteSession(editingSessionId)}
                      type="button"
                      disabled={deletingSessionIds[editingSessionId]}
                    >
                      {deletingSessionIds[editingSessionId] ? "Deleting..." : "Delete Session"}
                    </button>
                  </div>
                ) : null}

                <div className="feeding-form-actions">
                  <button
                    className="feeding-form-button primary"
                    onClick={handleSaveSession}
                    type="button"
                    disabled={isSavingSessionSubmit}
                  >
                    {isSavingSessionSubmit ? "Saving..." : "Save Session"}
                  </button>

                  <button className="feeding-form-button secondary" onClick={isEditing ? closePanel : resetForm} type="button">
                    {isEditing ? "Cancel Edit" : "Clear"}
                  </button>
                </div>

                

                {/* Quick rule preview (front-end only) */}
                <div className="feeding-rule-box">
                  <div className="feeding-rule-title">Rules (MVP)</div>
                  <ul>
                    <li>Exactly 1 feeding session per week (Mon–Fri).</li>
                    <li>Weekdays only; past dates blocked.</li>
                    <li>Attendance stored per session and student.</li>
                  </ul>
                </div>
              </div>
            </div>
            </aside>
          ) : null}
        </div>
      </div>

      {/* Session Details Modal */}
      {sessionDetails ? (
        
        <div className="feeding-modal-overlay" onClick={closeSessionDetails}>
          {console.log(sessionDetails)}
          <div className="feeding-modal feeding-session-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="feeding-modal-header">
              <div className="feeding-modal-title">
                <div className="feeding-modal-title-text">
                  <h2>Session Details</h2>
                  <p>Static information view</p>
                </div>
              </div>

              <button className="feeding-modal-close" onClick={closeSessionDetails} type="button" aria-label="Close session details">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="feeding-modal-content">
              <div className="feeding-session-details-grid">
                <div className="feeding-session-details-item">
                  <label>Session ID</label>
                  <div className="value">{sessionDetails.session_id}</div>
                </div>
                <div className="feeding-session-details-item">
                  <label>Status</label>
                  <div className="value">
                    <span className={`feeding-status-pill ${getStatusClass(sessionDetails.status)}`}>
                      {getStatusLabel(sessionDetails.status)}
                    </span>
                  </div>
                </div>
                <div className="feeding-session-details-item">
                  <label>Session Date</label>
                  <div className="value">{formatDateLabel(sessionDetails.date)}</div>
                </div>
                <div className="feeding-session-details-item">
                  <label>Date Created</label>
                  <div className="value">{formatDateLabel(sessionDetails.created_at)}</div>
                </div>
              </div>

              <div className="feeding-session-details-section">
                <h3>Participating Sections</h3>
                <div className="feeding-session-details-chips">
                  {(sessionDetails.section_ids || []).length ? (
                    sessionDetails.section_ids.map((id) => (
                      <span className="feeding-chip" key={id}>
                        {sectionLabelById.get(id) || id}
                      </span>
                    ))
                  ) : (
                    <span className="muted">No sections listed</span>
                  )}
                </div>
              </div>

              <div className="feeding-session-details-section">
                <h3>Sponsors</h3>
                <p>{sessionDetails.sponsors_text || "No sponsors listed"}</p>
              </div>

              <div className="feeding-session-details-section">
                <h3>Total Cost</h3>
                <p>{sessionDetails.total_cost !== null && sessionDetails.total_cost !== undefined ? formatPeso(sessionDetails.total_cost) : "Not recorded"}</p>
              </div>

              <div className="feeding-session-details-section">
                <h3>
                  Foods Served{(sessionDetails.foods || []).length ? ` (${sessionDetails.foods.length})` : ""}
                </h3>
                {(sessionDetails.foods || []).length ? (
                  <>
                    <div className="feeding-session-details-chips">
                      {groupSessionFoods(sessionDetails.foods).map((group) => (
                        <span className={`feeding-chip feeding-food-chip ${group.value}`} key={group.value}>
                          <span className={`feeding-food-dot ${group.value}`} aria-hidden="true" />
                          {group.label} {group.items.length}
                        </span>
                      ))}
                    </div>
                    <div className="feeding-food-groups">
                      {groupSessionFoods(sessionDetails.foods).map((group) => (
                        <div className="feeding-food-group" key={group.value}>
                          <div className={`feeding-food-group-title ${group.value}`}>{group.label}</div>
                          <ul className="feeding-food-group-list">
                            {group.items.map((food, index) => (
                              <li key={`${food.name}-${index}`}>{food.name}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p>No food listed</p>
                )}
              </div>
            </div>

          </div>
        </div>
      ) : null}

      {/* Attendance Modal */}
      {attendanceOpen && attendanceSession ? (
        <div className="feeding-modal-overlay" onClick={closeAttendance}>
          <div className="feeding-modal" onClick={(e) => e.stopPropagation()}>
            <div className="feeding-modal-header">
              <div className="feeding-modal-title">
                <div className="feeding-modal-title-text">
                  <h2>Attendance</h2>
                  <p>
                    {formatSessionDateLabel(attendanceSession.date)} •{" "}
                    {attendanceSections.map((sid) => sectionLabelById.get(sid) || sid).join(", ")}
                  </p>
                </div>
              </div>

              <button className="feeding-modal-close" onClick={closeAttendance} type="button" aria-label="Close attendance">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="feeding-modal-content">
              {/* Section tabs */}
              <div className="feeding-tabs">
                {attendanceSections.map((sid) => {
                  // {console.log(sid)}
                  const active = sid === attendanceActiveSectionId;
                  const label = sectionLabelById.get(sid) || sid;
                  const counts = attendanceSessionId ? computeAttendanceCounts(attendanceSessionId, sid) : { present: 0, absent: 0, total: 0 };

                  return (
                    <button
                      key={sid}
                      className={`feeding-tab ${active ? "active" : ""}`}
                      onClick={() => setAttendanceActiveSectionId(sid)}
                      type="button"
                    >
                      <div className="feeding-tab-label">{label}</div>
                      <div className="feeding-tab-sub">{counts.present} Present • {counts.absent} Absent</div>
                    </button>
                  );
                })}
              </div>

              <div className="feeding-attendance-actions">
                <button className="feeding-action-btn" onClick={markAllPresent} type="button" disabled={activeSectionSaved}>
                  Mark all present
                </button>
                <div className="feeding-attendance-summary">
                  {attendanceSessionId && attendanceActiveSectionId ? (() => {
                    const c = computeAttendanceCounts(attendanceSessionId, attendanceActiveSectionId);
                    return (
                      <span>
                        Summary: <b>{c.present}</b> present, <b>{c.absent}</b> absent (total {c.total})
                      </span>
                    );
                  })() : null}
                </div>
              </div>

              {/* Student rows */}
              <div className="feeding-attendance-table">
                <div className="feeding-attendance-head">
                  <div>Student</div>
                  <div className="centre">Present</div>
                  <div>Remarks</div>
                </div>

                {attendanceStudentsCurrentSection.length === 0 ? (
                  <div className="feeding-empty small">
                    <h3>No students</h3>
                    <p>This section has no students in dummy data.</p>
                  </div>
                ) : (
                  attendanceStudentsCurrentSection.map((stu) => {
                    const rec = attendanceForSession[stu.student_id] || { present: 1, remarks: "" };
                    return (
                      <div className="feeding-attendance-row" key={stu.student_id}>
                        <div className="feeding-student-name">{stu.full_name}</div>

                        <div className="centre">
                          <button
                            type="button"
                            className={`feeding-toggle ${rec.present === 1 ? "on" : "off"}`}
                            onClick={() => togglePresent(stu.student_id)}
                            disabled={activeSectionSaved}
                          >
                            {rec.present === 1 ? "Yes" : "No"}
                          </button>
                        </div>

                        <div>
                          <input
                            type="text"
                            className="feeding-remarks-input"
                            value={rec.remarks}
                            onChange={(e) => updateRemarks(stu.student_id, e.target.value)}
                            placeholder="Optional remarks"
                            disabled={activeSectionSaved}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="feeding-modal-actions">
              <button className="feeding-form-button secondary" onClick={closeAttendance} type="button">
                Close
              </button>
              {!activeSectionSaved ? (
                <button className="feeding-form-button primary" onClick={saveAttendance} type="button" disabled={isSavingAttendance}>
                  {isSavingAttendance ? "Saving..." : "Save attendance"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Success Toast */}
      {showToast && (
        <div className="feeding-toast">
          <svg
            className="feeding-toast-icon"
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
          <div className="feeding-toast-content">
            <h3 className="feeding-toast-title">Success!</h3>
            <p className="feeding-toast-message">{toastMessage}</p>
          </div>
          <button
            className="feeding-toast-close"
            onClick={() => setShowToast(false)}
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
      )}
    </div>
  );
}

export default FeedingProgram;
