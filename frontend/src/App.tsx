import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './hooks/useAuthStore';

// Admin pages
import AdminLogin from './pages/admin/Login';
import AdminLayout from './components/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Projects from './pages/admin/Projects';
import ProjectDetail from './pages/admin/ProjectDetail';
import ParticipantDetail from './pages/admin/ParticipantDetail';

// Organisation pages
import OrgLogin from './pages/organisation/Login';
import OrgRegister from './pages/organisation/Register';
import OrgDashboard from './pages/organisation/Dashboard';
import OrgProjectCreate from './pages/organisation/ProjectCreate';
import OrgProjectDetail from './pages/organisation/ProjectDetail';
import OrgBilling from './pages/organisation/Billing';
import OrgSettings from './pages/organisation/Settings';
import OrgParticipantDetail from './pages/organisation/ParticipantDetail';
import FoundingAccess from './pages/organisation/FoundingAccess';

// Super Admin pages
import SuperAdminLogin from './pages/superadmin/Login';
import SuperAdminDashboard from './pages/superadmin/Dashboard';

// Participant pages
import ParticipantLayout from './components/participant/ParticipantLayout';
import ReimbursementPage from './pages/participant/ReimbursementPage';
import InvalidLink from './pages/participant/InvalidLink';

function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      {/* Admin routes */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <ProtectedAdminRoute>
            <AdminLayout />
          </ProtectedAdminRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="participants/:id" element={<ParticipantDetail />} />
      </Route>

      {/* Organisation routes */}
      <Route path="/org/login" element={<OrgLogin />} />
      <Route path="/org/register" element={<OrgRegister />} />
      <Route path="/org/dashboard" element={<OrgDashboard />} />
      <Route path="/org/projects/new" element={<OrgProjectCreate />} />
      <Route path="/org/projects/:id" element={<OrgProjectDetail />} />
      <Route path="/org/participants/:id" element={<OrgParticipantDetail />} />
      <Route path="/org/billing" element={<OrgBilling />} />
      <Route path="/org/settings" element={<OrgSettings />} />
      <Route path="/founding-access" element={<FoundingAccess />} />

      {/* Super Admin routes */}
      <Route path="/super-admin/login" element={<SuperAdminLogin />} />
      <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />

      {/* Participant routes */}
      <Route path="/reimbursement" element={<ParticipantLayout />}>
        <Route index element={<ReimbursementPage />} />
      </Route>
      <Route path="/invalid-link" element={<InvalidLink />} />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/org/login" replace />} />
      <Route path="*" element={<Navigate to="/org/login" replace />} />
    </Routes>
  );
}

export default App;
