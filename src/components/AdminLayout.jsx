import React, { useEffect, useState } from 'react'
import { useNavigate } from "react-router";
import { Helmet } from 'react-helmet'
// Token-aware axios: attaches the login token and renews it when it expires (see ../api.js)
import { authAxios as axios, initAuth, logout } from "../api";

// STYLES
// The sidebar reuses the teacher sidebar's classes (.dashboard-sidebar, .dashboard-nav-item, ...)
// from DashboardStyle.css, so both sidebars always look the same.
import "../styles/DashboardStyle.css";
import "../styles/AdminDashboardStyle.css";

// COMPONENTS
import Loading from './Loading';
import { ROLE_ADMIN, getHomePathForRole } from './RequireRole';

// Images
import Logo from '../images/logo.png'

// Sidebar links, in display order. `path: null` is a placeholder: clicking does nothing.
const NAV_ITEMS = [
    {
        key: "dashboard",
        label: "Dashboard",
        path: "/admin",
        icon: ["M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"],
    },
    {
        key: "schools",
        label: "Schools",
        path: "/admin/schools",
        icon: ["M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"],
    },
    {
        key: "accounts",
        label: "Accounts",
        path: "/admin/accounts",
        icon: ["M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"],
    },
    {
        key: "settings",
        label: "Settings",
        path: "/admin/settings",
        icon: [
            "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
            "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
        ],
    },
];

const NavIcon = ({ paths }) => (
    <svg
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    >
    {paths.map((d) => (
        <path
            key={d}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={d}
        />
    ))}
    </svg>
);

// Frame shared by every admin page: left sidebar, page header and content area.
//
//   <AdminLayout active="schools" title="Schools" documentTitle="Feeding Program | Schools">
//       ...page content...
//   </AdminLayout>
//
// It also checks access: the page content is rendered only after the server has confirmed
// that the logged-in account is an admin. Each admin route is additionally wrapped in
// <RequireRole role="admin"> (see App.js), and every /api/admin/ route is admin-only on the server.
//
// `signedInAs` (optional) replaces the name in "Signed in as ...". Settings > My Account passes it
// so the header follows a name change without reloading the page.
function AdminLayout({ active, title, documentTitle, signedInAs, children }) {
    const navigate = useNavigate()
    const [user, setUser] = useState(null);
    const [checkingAuth, setCheckingAuth] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const loadAdmin = async () => {
            const data = await initAuth();
            if (!isMounted) {
                return;
            }

            if (!data?.status) {
                navigate("/login", { replace: true });
                return;
            }

            if (data.role !== ROLE_ADMIN) {
                navigate(getHomePathForRole(data.role), { replace: true });
                return;
            }

            try {
                // SECURITY: /api/admin/... answers 403 to anyone who is not an admin.
                // The page is shown only after the server has confirmed it.
                const response = await axios.get("/api/admin/overview");
                if (!isMounted) {
                    return;
                }
                if (!response.data?.status) {
                    navigate("/login", { replace: true });
                    return;
                }
                setUser(data);
                setCheckingAuth(false);
            } catch (error) {
                console.error("Admin access check error:", error);
                if (isMounted) {
                    navigate(getHomePathForRole(data.role), { replace: true });
                }
            }
        };
        loadAdmin();
        return () => {
            isMounted = false;
        };
    }, [navigate]);

    // Same logout as the teacher sidebar: shared logout() from api.js, then back to login
    const handleLogout = async () => {
        await logout();
        navigate("/");
    };

    if (checkingAuth) {
        return (
            <>
                <Helmet>
                    <title>{documentTitle}</title>
                </Helmet>
                <Loading />
            </>
        );
    }

    const adminName = signedInAs || (user?.first_name
        ? `${user.first_name} ${user.last_name}`
        : "Admin");

    return (
        <div className="admin-container">
            <Helmet>
                <title>{documentTitle}</title>
            </Helmet>

            {/* Left Sidebar (same markup and classes as the teacher sidebar in Dashboard.jsx) */}
            <aside className="dashboard-sidebar">
                <div className="dashboard-logo">
                <div className="dashboard-logo-icon">
                    <div className="dashboard-logo-circle">
                        <img src={Logo} alt="logo" />
                    </div>
                    <div className="dashboard-logo-text">
                    <h3>Feeding Program</h3>
                    <p>Admin Portal</p>
                    </div>
                </div>
                </div>

                <nav className="dashboard-nav">
                {NAV_ITEMS.map((item) => {
                    const isActive = item.key === active;
                    return (
                        <button
                            key={item.key}
                            className={`dashboard-nav-item ${isActive ? "active" : ""}`}
                            type="button"
                            aria-current={isActive ? "page" : undefined}
                            aria-label={item.label}
                            onClick={() => {
                                // Placeholder links (path: null) and the current page do nothing
                                if (item.path && !isActive) {
                                    navigate(item.path);
                                }
                            }}
                        >
                            <NavIcon paths={item.icon} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}

                <button className="dashboard-nav-item dashboard-nav-logout" type="button" aria-label="Logout" onClick={handleLogout}>
                    <NavIcon paths={["M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"]} />
                    <span>Logout</span>
                </button>
                </nav>
            </aside>

            {/* Main Content (to the right of the sidebar) */}
            <div className="admin-main">
            <header className="admin-header">
                <div className="admin-header-left">
                    <img src={Logo} alt="Feeding Program logo" className="admin-logo" />
                    <div>
                        <h1>{title}</h1>
                        <p className="admin-header-subtitle">Signed in as {adminName}</p>
                    </div>
                </div>
                <button className="admin-logout-button" type="button" onClick={handleLogout}>
                    Logout
                </button>
            </header>

            <main className="admin-content">
                {children}
            </main>
            </div>
        </div>
    )
}

export default AdminLayout
