import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
// Token-aware axios: attaches the login token and renews it when it expires (see ../api.js)
import { authAxios as axios } from "../api";
import {
    BarChart,
    Bar,
    Cell,
    LabelList,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

// STYLES
// The shared admin pieces (.admin-btn, .admin-card, .admin-form-field, ...) are in AdminSchoolsStyle.css
import "../styles/AdminSchoolsStyle.css";
import "../styles/AdminDashboardPageStyle.css";

// COMPONENTS
import AdminLayout from '../components/AdminLayout';

// Admin home page: system overview, programme outcomes and feeding delivery for the chosen filters.
// Every figure is computed by the server (server/admin_dashboard.py); this page only draws them.

const PERIOD_CUSTOM = "custom";

// Colour of each BMI status. Colour follows the status, whatever is shown or filtered.
// Checked for colour-blind separation and contrast; every chart also carries labels and a table view,
// so a status is never told by colour alone. "underweight" comes from the regular BMI rule only.
const STATUS_COLORS = {
    "severely wasted": "#b91c1c",
    "wasted": "#d97706",
    "normal": "#15803d",
    "overweight": "#0284c7",
    "obese": "#7c3aed",
    "underweight": "#a8a29e",
};
const STATUS_FALLBACK_COLOR = "#9ca3af";

const PROGRESS_PARTS = [
    { key: "improved", label: "Improved", color: "#15803d", sign: "▲" },
    { key: "unchanged", label: "Unchanged", color: "#9ca3af", sign: "●" },
    { key: "worsened", label: "Worsened", color: "#b91c1c", sign: "▼" },
];

const USAGE_PARTS = [
    { key: "recent", color: "#15803d" },
    { key: "earlier", color: "#d97706" },
    { key: "never", color: "#9ca3af" },
];

const FOOD_GROUP_COLORS = {
    go: "#d97706",
    grow: "#b91c1c",
    glow: "#15803d",
    not_specified: "#9ca3af",
};

const INK = "#111827";
const MUTED_INK = "#6b7280";
const GRID = "#f3f4f6";

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

// 40 -> "40%", 62.5 -> "62.5%", null -> "—"
const formatPercent = (value) => (value === null || value === undefined ? "—" : `${Number(value).toFixed(1).replace(/\.0$/, "")}%`);

const formatNumber = (value) => Number(value || 0).toLocaleString("en-US");

// 62.5 -> "₱62.50"
const formatPeso = (value) =>
    value === null || value === undefined
        ? "—"
        : `₱${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// 3 -> "3 students", 1 -> "1 student"
const countLabel = (count, noun) => `${formatNumber(count)} ${noun}${count === 1 ? "" : "s"}`;

// One headline number with a short explanation
const StatCard = ({ label, value, detail, children }) => (
    <div className="admin-dash-stat">
        <span className="admin-dash-stat-label">{label}</span>
        <strong className="admin-dash-stat-value">{value}</strong>
        {detail ? <span className="admin-dash-stat-detail">{detail}</span> : null}
        {children}
    </div>
);

// A titled block. `question` says what the block answers, so no chart is there without a reason.
const Panel = ({ title, question, wide, children }) => (
    <section className={`admin-card admin-dash-panel ${wide ? "wide" : ""}`}>
        <h3>{title}</h3>
        {question ? <p className="admin-dash-question">{question}</p> : null}
        {children}
    </section>
);

// One horizontal bar split into labelled parts, with a legend that carries the numbers.
// parts = [{ key, label, count, color, sign }]
const SplitBar = ({ parts, total, ariaLabel }) => (
    <div className="admin-dash-split">
        <div className="admin-dash-split-bar" role="img" aria-label={ariaLabel}>
            {total > 0
                ? parts.filter((part) => part.count > 0).map((part) => (
                    <span
                        key={part.key}
                        style={{ flexGrow: part.count, backgroundColor: part.color }}
                        title={`${part.label}: ${formatNumber(part.count)} (${formatPercent((part.count * 100) / total)})`}
                    />
                ))
                : <span className="empty" />}
        </div>
        <ul className="admin-dash-legend">
            {parts.map((part) => (
                <li key={part.key}>
                    <i style={{ backgroundColor: part.color }} aria-hidden="true" />
                    <span>{part.sign ? `${part.sign} ` : ""}{part.label}</span>
                    <strong>{formatNumber(part.count)}</strong>
                    <em>{total > 0 ? formatPercent((part.count * 100) / total) : "—"}</em>
                </li>
            ))}
        </ul>
    </div>
);

// A share out of 100% (coverage, attendance)
const Meter = ({ percent, ariaLabel }) => (
    <div className="admin-dash-meter" role="img" aria-label={ariaLabel}>
        <span style={{ width: `${Math.max(0, Math.min(100, Number(percent) || 0))}%` }} />
    </div>
);

// The numbers behind a chart, for anyone who prefers (or needs) a table
const TableView = ({ caption, headers, rows }) => (
    <details className="admin-dash-table">
        <summary>View as table</summary>
        <div className="admin-dash-table-scroll">
            <table>
                <caption>{caption}</caption>
                <thead>
                    <tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row[0]}>
                            {row.map((cell, index) => (index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </details>
);

// Tooltip of the two status charts: every status with its count and share
const StatusTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) {
        return null;
    }
    const row = payload[0].payload;
    const items = row.items || [{ label: row.label, count: row.count, percent: row.percent, color: row.color }];
    return (
        <div className="admin-dash-tooltip">
            <strong>{row.tooltipTitle || label}</strong>
            {items.map((item) => (
                <div key={item.label}>
                    <i style={{ backgroundColor: item.color }} aria-hidden="true" />
                    <span>{item.label}</span>
                    <b>{formatNumber(item.count)}</b>
                    <em>{formatPercent(item.percent)}</em>
                </div>
            ))}
        </div>
    );
};

// Change against the previous period, in percentage points. Words and an arrow, never colour alone.
const renderChange = (change, previous) => {
    if (change === null || change === undefined) {
        return "No earlier figure to compare with";
    }
    const since = `since ${formatDate(previous?.to)}`;
    if (change === 0) {
        return `No change ${since}`;
    }
    return `${change > 0 ? "▲ Up" : "▼ Down"} ${Math.abs(change).toFixed(1).replace(/\.0$/, "")} points ${since}`;
};

function AdminDashboard() {
    // Filters
    const [schoolId, setSchoolId] = useState("");
    const [periodKey, setPeriodKey] = useState("school_year");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [grade, setGrade] = useState("");
    const [sex, setSex] = useState("");
    const [includeArchived, setIncludeArchived] = useState(false);

    // Data
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [filterErrors, setFilterErrors] = useState({});
    const requestRef = useRef(0);

    // A custom period is sent only once both of its dates are filled in
    const customIncomplete = periodKey === PERIOD_CUSTOM && (!dateFrom || !dateTo);

    const loadDashboard = useCallback(() => {
        if (customIncomplete) {
            return;
        }
        const requestId = requestRef.current + 1;
        requestRef.current = requestId;

        setLoading(true);
        setLoadError("");
        axios
            .get("/api/admin/dashboard", {
                params: {
                    schoolId: schoolId || undefined,
                    grade: grade || undefined,
                    sex: sex || undefined,
                    includeArchived: includeArchived ? 1 : undefined,
                    period: periodKey,
                    dateFrom: periodKey === PERIOD_CUSTOM ? dateFrom : undefined,
                    dateTo: periodKey === PERIOD_CUSTOM ? dateTo : undefined,
                },
            })
            .then((response) => {
                // Ignore the answer to an older choice of filters
                if (requestRef.current !== requestId) {
                    return;
                }
                if (!response.data?.status) {
                    setFilterErrors(response.data?.errors || {});
                    if (!response.data?.errors) {
                        setLoadError(response.data?.message || "The dashboard could not be loaded.");
                    }
                    return;
                }
                setFilterErrors({});
                setData(response.data);
            })
            .catch((error) => {
                console.error("Fetching dashboard error:", error);
                if (requestRef.current === requestId) {
                    setLoadError("The dashboard could not be loaded. Check your connection and try again.");
                }
            })
            .finally(() => {
                if (requestRef.current === requestId) {
                    setLoading(false);
                }
            });
    }, [schoolId, grade, sex, includeArchived, periodKey, dateFrom, dateTo, customIncomplete]);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    const hasFilters = Boolean(schoolId || grade || sex || includeArchived) || periodKey !== "school_year";

    const clearFilters = () => {
        setSchoolId("");
        setGrade("");
        setSex("");
        setIncludeArchived(false);
        setPeriodKey("school_year");
        setDateFrom("");
        setDateTo("");
    };

    const options = data?.options;
    const filters = data?.filters;
    const overview = data?.overview;
    const outcomes = data?.outcomes;
    const feeding = data?.feeding;

    // ==========================
    // Chart data
    // ==========================
    const breakdownData = useMemo(
        () => (outcomes?.breakdown || []).map((item) => ({ ...item, color: STATUS_COLORS[item.status] || STATUS_FALLBACK_COLOR, tooltipTitle: "Students with this status" })),
        [outcomes]
    );

    // Statuses drawn in the monthly chart: the ones in the breakdown, in the same order
    const trendStatuses = useMemo(
        () => (outcomes?.breakdown || []).map((item) => ({ status: item.status, label: item.label, color: STATUS_COLORS[item.status] || STATUS_FALLBACK_COLOR })),
        [outcomes]
    );

    // Each month as shares of the students assessed by then, so months with different numbers of students compare fairly
    const trendData = useMemo(
        () => (outcomes?.trend || []).map((month) => {
            const row = { month: month.label, tooltipTitle: `${month.label} (${countLabel(month.assessed, "student")})`, assessed: month.assessed, items: [] };
            trendStatuses.forEach((series) => {
                const count = month.counts?.[series.status] || 0;
                const share = month.assessed ? (count * 100) / month.assessed : 0;
                row[series.status] = share;
                row.items.push({ label: series.label, count, percent: month.assessed ? share : null, color: series.color });
            });
            return row;
        }),
        [outcomes, trendStatuses]
    );

    const progressParts = PROGRESS_PARTS.map((part) => ({ ...part, count: outcomes?.progress?.[part.key] || 0 }));

    const usage = overview?.usage;
    const usageParts = usage
        ? [
            { ...USAGE_PARTS[0], label: `Logged in within ${usage.days} days`, count: usage.recent },
            { ...USAGE_PARTS[1], label: `Last login more than ${usage.days} days ago`, count: usage.earlier },
            { ...USAGE_PARTS[2], label: "Never logged in", count: usage.never },
        ]
        : [];
    const usageTotal = usageParts.reduce((sum, part) => sum + part.count, 0);

    const foodParts = (feeding?.food_groups || []).map((group) => ({
        key: group.group,
        label: group.label,
        count: group.count,
        color: FOOD_GROUP_COLORS[group.group] || STATUS_FALLBACK_COLOR,
    }));
    const foodTotal = foodParts.reduce((sum, part) => sum + part.count, 0);

    const noStudents = Boolean(overview) && overview.students === 0;
    const showBySchool = Boolean(outcomes) && !filters?.school_id;
    const sessions = feeding?.sessions;
    const attentionTotal = (overview?.attention || []).reduce((sum, item) => sum + item.count, 0);

    return (
        <AdminLayout active="dashboard" title="Admin Dashboard" documentTitle="Feeding Program | Admin">
            {/* Filters: one row above everything they control */}
            <div className="admin-card admin-dash-filters" role="group" aria-label="Dashboard filters">
                <div className="admin-form-field">
                    <label htmlFor="dash-school">School</label>
                    <select id="dash-school" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                        <option value="">All schools</option>
                        {(options?.schools || []).map((school) => (
                            <option key={school.school_id} value={String(school.school_id)}>
                                {school.school_name}{school.is_active ? "" : " (archived)"}
                            </option>
                        ))}
                    </select>
                    {filterErrors.schoolId ? <span className="admin-form-error">{filterErrors.schoolId}</span> : null}
                </div>

                <div className="admin-form-field">
                    <label htmlFor="dash-period">Period</label>
                    <select id="dash-period" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}>
                        {(options?.periods || [{ key: "school_year", label: "School year" }]).map((period) => (
                            <option key={period.key} value={period.key}>{period.label}</option>
                        ))}
                        <option value={PERIOD_CUSTOM}>Custom range</option>
                    </select>
                    {filterErrors.period ? <span className="admin-form-error">{filterErrors.period}</span> : null}
                </div>

                {periodKey === PERIOD_CUSTOM ? (
                    <>
                        <div className="admin-form-field">
                            <label htmlFor="dash-date-from">From</label>
                            <input id="dash-date-from" type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className={filterErrors.dateFrom ? "error" : ""} />
                            {filterErrors.dateFrom ? <span className="admin-form-error">{filterErrors.dateFrom}</span> : null}
                        </div>
                        <div className="admin-form-field">
                            <label htmlFor="dash-date-to">To</label>
                            <input id="dash-date-to" type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className={filterErrors.dateTo ? "error" : ""} />
                            {filterErrors.dateTo ? <span className="admin-form-error">{filterErrors.dateTo}</span> : null}
                        </div>
                    </>
                ) : null}

                <div className="admin-form-field">
                    <label htmlFor="dash-grade">Grade level</label>
                    <select id="dash-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
                        <option value="">All grade levels</option>
                        {(options?.grades || []).map((item) => (
                            <option key={item.value} value={String(item.value)}>{item.label}</option>
                        ))}
                    </select>
                </div>

                <div className="admin-form-field">
                    <label htmlFor="dash-sex">Sex</label>
                    <select id="dash-sex" value={sex} onChange={(e) => setSex(e.target.value)}>
                        <option value="">All</option>
                        {(options?.sexes || []).map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                    </select>
                </div>

                <label className="admin-dash-check">
                    <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} disabled={Boolean(schoolId)} />
                    Include archived schools
                </label>

                {hasFilters ? (
                    <button type="button" className="admin-btn secondary small admin-dash-clear" onClick={clearFilters}>
                        Reset filters
                    </button>
                ) : null}
            </div>

            {/* What the figures below refer to */}
            <p className="admin-dash-scope" role="status" aria-live="polite">
                {customIncomplete
                    ? "Choose both dates to see the custom period."
                    : loading && !data
                        ? "Loading the dashboard…"
                        : filters
                            ? `${filters.school_name || "All schools"} · ${formatDate(filters.period.from)} to ${formatDate(filters.period.to)} · figures as of ${formatDate(filters.as_of)}${loading ? " · updating…" : ""}`
                            : ""}
            </p>

            {loadError ? (
                <div className="admin-card">
                    <div className="admin-state" role="alert">
                        <h3>The dashboard could not be loaded</h3>
                        <p>{loadError}</p>
                        <button type="button" className="admin-btn secondary" onClick={loadDashboard}>
                            Try again
                        </button>
                    </div>
                </div>
            ) : null}

            {data && !loadError ? (
                <div className={`admin-dash ${loading ? "is-updating" : ""}`}>
                    {filters.not_started ? (
                        <div className="admin-dash-notice" role="note">
                            This period has not started yet. The figures show the situation as of today.
                        </div>
                    ) : null}

                    {/* ============================== SYSTEM OVERVIEW ============================== */}
                    <h2 className="admin-dash-heading">System overview</h2>

                    <div className="admin-dash-stats">
                        <StatCard label="Schools" value={formatNumber(overview.schools.active)} detail={overview.schools.archived ? `active · ${formatNumber(overview.schools.archived)} archived` : "active"} />
                        <StatCard label="Teachers" value={formatNumber(overview.teachers.active)} detail={overview.teachers.deactivated ? `active · ${formatNumber(overview.teachers.deactivated)} deactivated` : "active"} />
                        <StatCard label="Students" value={formatNumber(overview.students)} detail="enrolled in the feeding programme" />
                        <StatCard label="Sections" value={formatNumber(overview.sections)} detail="created by teachers" />
                    </div>

                    <div className="admin-dash-grid">
                        <Panel title="Teacher usage" question="Are teachers actually using the system?">
                            {usageTotal > 0
                                ? <SplitBar parts={usageParts} total={usageTotal} ariaLabel={`Of ${countLabel(usageTotal, "active teacher")}: ${usageParts.map((part) => `${part.count} ${part.label.toLowerCase()}`).join(", ")}`} />
                                : <p className="admin-dash-empty">No active teachers match these filters.</p>}
                        </Panel>

                        <Panel title="Measurement coverage" question="Are the outcome figures based on most students, or only a few?">
                            {overview.students > 0 ? (
                                <>
                                    <div className="admin-dash-figure">
                                        <strong>{formatPercent(overview.coverage.percent)}</strong>
                                        <span>{formatNumber(overview.coverage.measured)} of {countLabel(overview.coverage.students, "student")} measured in this period</span>
                                    </div>
                                    <Meter percent={overview.coverage.percent} ariaLabel={`${formatPercent(overview.coverage.percent)} of students measured in this period`} />
                                </>
                            ) : <p className="admin-dash-empty">No students match these filters.</p>}
                        </Panel>

                        <Panel title="Needs attention" question="What should be followed up?">
                            <ul className="admin-dash-attention">
                                {overview.attention.map((item) => (
                                    <li key={item.key} className={item.count > 0 ? "has-items" : ""}>
                                        <span>{item.label}</span>
                                        <strong>{formatNumber(item.count)}</strong>
                                    </li>
                                ))}
                            </ul>
                            {attentionTotal === 0 ? <p className="admin-dash-empty">Nothing to follow up.</p> : null}
                        </Panel>
                    </div>

                    {/* ============================== PROGRAMME OUTCOMES ============================== */}
                    <h2 className="admin-dash-heading">Programme outcomes</h2>

                    {noStudents || outcomes.assessed === 0 ? (
                        <div className="admin-card">
                            <div className="admin-state">
                                <h3>No students to report on</h3>
                                <p>No student matches these filters, or none had been measured by {formatDate(filters.as_of)}.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="admin-dash-stats three">
                                <StatCard
                                    label="Normal"
                                    value={formatPercent(outcomes.normal.percent)}
                                    detail={`${formatNumber(outcomes.normal.count)} of ${countLabel(outcomes.assessed, "student")}`}
                                >
                                    <span className="admin-dash-stat-change">{renderChange(outcomes.normal.change, outcomes.previous)}</span>
                                </StatCard>
                                <StatCard
                                    label="At-Risk"
                                    value={formatPercent(outcomes.at_risk.percent)}
                                    detail={`${formatNumber(outcomes.at_risk.count)} of ${countLabel(outcomes.assessed, "student")} · any status other than Normal`}
                                >
                                    <span className="admin-dash-stat-change">{renderChange(outcomes.at_risk.change, outcomes.previous)}</span>
                                </StatCard>
                                <StatCard
                                    label="Stunted or Severely Stunted"
                                    value={formatPercent(outcomes.stunting.percent)}
                                    detail={outcomes.stunting.classified
                                        ? `${formatNumber(outcomes.stunting.count)} of ${countLabel(outcomes.stunting.classified, "student")} with a Height-for-Age status`
                                        : "No student has a Height-for-Age status"}
                                />
                            </div>

                            <div className="admin-dash-grid two">
                                <Panel title="BMI status now" question="What kind of problem is there: mostly wasted, or mostly overweight?">
                                    <div className="admin-dash-chart" role="img" aria-label={`BMI status of ${countLabel(outcomes.assessed, "student")}: ${breakdownData.map((item) => `${item.label} ${item.count}`).join(", ")}`}>
                                        <ResponsiveContainer width="100%" height={260}>
                                            <BarChart data={breakdownData} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
                                                <CartesianGrid vertical={false} stroke={GRID} />
                                                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#e5e7eb" }} tick={{ fill: MUTED_INK, fontSize: 12 }} interval={0} />
                                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: MUTED_INK, fontSize: 12 }} width={36} />
                                                <Tooltip content={<StatusTooltip />} cursor={{ fill: "#f9fafb" }} />
                                                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
                                                    {breakdownData.map((item) => <Cell key={item.status} fill={item.color} />)}
                                                    <LabelList dataKey="count" position="top" fill={INK} fontSize={12} />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <TableView
                                        caption={`BMI status as of ${formatDate(filters.as_of)}`}
                                        headers={["Status", "Students", "Share"]}
                                        rows={breakdownData.map((item) => [item.label, formatNumber(item.count), formatPercent(item.percent)])}
                                    />
                                </Panel>

                                <Panel title="Progress within the period" question="Are individual students getting better?">
                                    {outcomes.progress.compared > 0 ? (
                                        <>
                                            <SplitBar
                                                parts={progressParts}
                                                total={outcomes.progress.compared}
                                                ariaLabel={`Of ${countLabel(outcomes.progress.compared, "student")} measured at least twice: ${progressParts.map((part) => `${part.count} ${part.label.toLowerCase()}`).join(", ")}`}
                                            />
                                            <p className="admin-dash-note">
                                                Compares each student's first and latest measurement in the period ({countLabel(outcomes.progress.compared, "student")} measured at least twice).
                                                Improved means a status closer to Normal than before.
                                            </p>
                                        </>
                                    ) : (
                                        <p className="admin-dash-empty">No student was measured twice in this period yet, so there is nothing to compare.</p>
                                    )}
                                </Panel>
                            </div>

                            <Panel title="BMI status over time" question="Is the share of Normal students growing?" wide>
                                {trendData.length > 0 ? (
                                    <>
                                        <div className="admin-dash-chart" role="img" aria-label={`Share of students in each BMI status at the end of each month, ${trendData[0].month} to ${trendData[trendData.length - 1].month}`}>
                                            <ResponsiveContainer width="100%" height={300}>
                                                <BarChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                                    <CartesianGrid vertical={false} stroke={GRID} />
                                                    <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "#e5e7eb" }} tick={{ fill: MUTED_INK, fontSize: 12 }} />
                                                    <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} tick={{ fill: MUTED_INK, fontSize: 12 }} width={44} />
                                                    <Tooltip content={<StatusTooltip />} cursor={{ fill: "#f9fafb" }} />
                                                    {/* Same order as the bars (lowest status first), not alphabetical */}
                                                    <Legend
                                                        iconType="square"
                                                        iconSize={10}
                                                        itemSorter={(item) => trendStatuses.findIndex((series) => series.label === item.value)}
                                                        formatter={(value) => <span style={{ color: INK, fontSize: 13 }}>{value}</span>}
                                                    />
                                                    {trendStatuses.map((series) => (
                                                        <Bar
                                                            key={series.status}
                                                            dataKey={series.status}
                                                            name={series.label}
                                                            stackId="status"
                                                            fill={series.color}
                                                            stroke="#ffffff"
                                                            strokeWidth={2}
                                                            maxBarSize={56}
                                                            isAnimationActive={false}
                                                        />
                                                    ))}
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <p className="admin-dash-note">
                                            Each bar is every student's latest status at the end of that month, as a share of the students measured by then.
                                        </p>
                                        <TableView
                                            caption="Students in each BMI status at the end of each month"
                                            headers={["Month", "Students", ...trendStatuses.map((series) => series.label)]}
                                            rows={trendData.map((row) => [row.month, formatNumber(row.assessed), ...row.items.map((item) => `${formatNumber(item.count)} (${formatPercent(item.percent)})`)])}
                                        />
                                    </>
                                ) : (
                                    <p className="admin-dash-empty">This period has no months to show yet.</p>
                                )}
                            </Panel>

                            {/* Comparing schools only makes sense while all schools are shown */}
                            {showBySchool ? (
                                <Panel title="At-Risk by school" question="Which schools need help first?" wide>
                                    <ol className="admin-dash-ranking">
                                        {outcomes.by_school.map((school) => (
                                            <li key={school.school_id ?? "none"}>
                                                <span className="admin-dash-ranking-name">{school.school_name}</span>
                                                <span className="admin-dash-ranking-bar" aria-hidden="true">
                                                    <span style={{ width: `${school.at_risk_percent || 0}%` }} />
                                                </span>
                                                <strong>{formatPercent(school.at_risk_percent)}</strong>
                                                <em>{formatNumber(school.at_risk)} of {countLabel(school.students, "student")}</em>
                                            </li>
                                        ))}
                                    </ol>
                                    <p className="admin-dash-note">Highest share of At-Risk students first. A school with few students can move a lot from one measurement.</p>
                                </Panel>
                            ) : null}
                        </>
                    )}

                    {/* ============================== FEEDING DELIVERY ============================== */}
                    <h2 className="admin-dash-heading">Feeding delivery</h2>
                    <p className="admin-dash-subheading">Is the feeding actually happening? Sessions dated within the period, up to today.</p>

                    <div className="admin-dash-stats four">
                        <StatCard
                            label="Sessions held"
                            value={formatNumber(sessions.completed)}
                            detail={`${formatNumber(sessions.cancelled)} cancelled · ${formatNumber(sessions.pending)} not marked completed`}
                        />
                        <StatCard
                            label="Attendance rate"
                            value={formatPercent(feeding.attendance.percent)}
                            detail={feeding.attendance.recorded
                                ? `${formatNumber(feeding.attendance.present)} present of ${formatNumber(feeding.attendance.recorded)} recorded`
                                : "No attendance recorded"}
                        >
                            {feeding.attendance.recorded ? <Meter percent={feeding.attendance.percent} ariaLabel={`Attendance rate ${formatPercent(feeding.attendance.percent)}`} /> : null}
                        </StatCard>
                        <StatCard
                            label="Cost per meal served"
                            value={formatPeso(feeding.cost.per_meal)}
                            detail={feeding.cost.sessions_with_cost
                                ? `${formatPeso(feeding.cost.total)} over ${formatNumber(feeding.cost.meals)} meals · cost entered for ${formatNumber(feeding.cost.sessions_with_cost)} of ${countLabel(feeding.cost.sessions_completed, "session")}`
                                : "No session has a cost entered"}
                        />
                        <div className="admin-dash-stat">
                            <span className="admin-dash-stat-label">Go, Grow, Glow mix</span>
                            {foodTotal > 0
                                ? <SplitBar parts={foodParts} total={foodTotal} ariaLabel={`Foods served by group: ${foodParts.map((part) => `${part.label} ${part.count}`).join(", ")}`} />
                                : <span className="admin-dash-stat-detail">No foods recorded for completed sessions</span>}
                        </div>
                    </div>
                    {(grade || sex) ? (
                        <p className="admin-dash-note">Grade level and Sex narrow the attendance rate only. Sessions, cost and foods cover every student at those sessions.</p>
                    ) : null}
                </div>
            ) : null}
        </AdminLayout>
    )
}

export default AdminDashboard
