import './output.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// COMPONENTS
import RequireRole, { ROLE_TEACHER, ROLE_ADMIN } from './components/RequireRole';

// PAGES
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ChangePassword from './pages/ChangePassword';
import Students from './pages/Students';
import FeedingProgram from './pages/FeedingProgram';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import AdminSchools from './pages/AdminSchools';
import AdminAccounts from './pages/AdminAccounts';
import AdminSettings from './pages/AdminSettings';

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<Login />}></Route>
          <Route path="/ChangePassword/:userMail/:uid" element={<ChangePassword />}></Route>

          {/* Teacher pages: an admin who opens one is sent to /admin */}
          <Route path="/profile" element={<RequireRole role={ROLE_TEACHER}><Profile /></RequireRole>}></Route>
          <Route path="/dashboard" element={<RequireRole role={ROLE_TEACHER}><Dashboard /></RequireRole>}></Route>
          <Route path="/Students" element={<RequireRole role={ROLE_TEACHER}><Students /></RequireRole>}></Route>
          <Route path="/FeedingProgram" element={<RequireRole role={ROLE_TEACHER}><FeedingProgram /></RequireRole>}></Route>

          {/* Admin pages: a teacher who opens one is sent to /dashboard.
              Every page under /admin must be wrapped the same way. */}
          <Route path="/admin" element={<RequireRole role={ROLE_ADMIN}><AdminDashboard /></RequireRole>}></Route>
          <Route path="/admin/schools" element={<RequireRole role={ROLE_ADMIN}><AdminSchools /></RequireRole>}></Route>
          <Route path="/admin/accounts" element={<RequireRole role={ROLE_ADMIN}><AdminAccounts /></RequireRole>}></Route>
          <Route path="/admin/settings" element={<RequireRole role={ROLE_ADMIN}><AdminSettings /></RequireRole>}></Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
