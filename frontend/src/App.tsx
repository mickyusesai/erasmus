import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './hooks/useAuthStore';

// Admin pages
import AdminLogin from './pages/admin/Login';
import AdminLayout from './components/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Projects from './pages/admin/Projects';
import ProjectDetail from './pages/admin/ProjectDetail';
import ParticipantDetail from './pages/admin/ParticipantDetail';

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

      {/* Participant routes */}
      <Route path="/reimbursement" element={<ParticipantLayout />}>
        <Route index element={<ReimbursementPage />} />
      </Route>
      <Route path="/invalid-link" element={<InvalidLink />} />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

export default App;
