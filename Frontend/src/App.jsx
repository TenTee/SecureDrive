import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import AdminLayout from "./pages/AdminLayout.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import MyFiles from "./pages/MyFiles.jsx";
import SharedWithMe from "./pages/SharedWithMe.jsx";
import SharedFiles from "./pages/SharedFiles.jsx";
import Recent from "./pages/Recent.jsx";
import Favorites from "./pages/Favorites.jsx";
import Trash from "./pages/Trash.jsx";
import UserManagement from "./pages/UserManagement.jsx";
import ActivityLog from "./pages/ActivityLog.jsx";
import SystemSettings from "./pages/SystemSettings.jsx";
import MyProfile from "./pages/MyProfile.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import "./App.css";

export default function App() {
  return (
    <div className="app-root">
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="files" element={<MyFiles />} />
          <Route path="shared-with-me" element={<SharedWithMe />} />
          <Route path="shared-by-me" element={<SharedFiles />} />
          <Route path="recent" element={<Recent />} />
          <Route path="favorites" element={<Favorites />} />
          <Route path="trash" element={<Trash />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="activity" element={<ActivityLog />} />
          <Route path="settings" element={<SystemSettings />} />
          <Route path="profile" element={<MyProfile />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}