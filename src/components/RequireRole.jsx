import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { initAuth } from '../api'

// COMPONENTS
import Loading from './Loading'

// ROLES (same values as tblTeachers.role)
export const ROLE_TEACHER = "teacher";
export const ROLE_ADMIN = "admin";

// Home page of each role. Used after login and when a user opens a page of the other role.
export const getHomePathForRole = (role) => (role === ROLE_ADMIN ? "/admin" : "/dashboard");

// Route guard: shows its children only to a logged-in user with the given role.
//   - not logged in        -> login page
//   - logged in, other role -> that role's own home page
//
// This only decides what the browser shows. The real protection is on the server:
// every /api/admin/ route rejects non-admins and every teacher route rejects admins
// (see require_login in server/server.py).
function RequireRole({ role, children }) {
    // null = still checking, otherwise { loggedIn, role }
    const [auth, setAuth] = useState(null);

    useEffect(() => {
        let isMounted = true;
        const checkUser = async () => {
            const data = await initAuth();
            if (!isMounted) {
                return;
            }
            setAuth({ loggedIn: Boolean(data?.status), role: data?.role });
        };
        checkUser();
        return () => {
            isMounted = false;
        };
    }, []);

    if (auth === null) {
        return <Loading />;
    }

    if (!auth.loggedIn) {
        return <Navigate to="/login" replace />;
    }

    if (auth.role !== role) {
        return <Navigate to={getHomePathForRole(auth.role)} replace />;
    }

    return children;
}

export default RequireRole
