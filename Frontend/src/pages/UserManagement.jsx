import { useState, useEffect } from "react";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";

const ROLE_TAG_CLASS = {
  "Super Admin": "tag-purple",
  Manager: "tag-blue",
  User: "tag-gray",
};

const ROLE_AVATAR_COLOR = {
  "Super Admin": "#2563eb",
  Manager: "#7c3aed",
  User: "#0891b2",
};

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function mapBackendUser(u) {
  const fullName = `${u.first_name} ${u.last_name}`;
  return {
    id: u.id,
    name: fullName,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    role: u.role,
    status: u.status,
    storage: "—",
    initials: getInitials(fullName),
    color: ROLE_AVATAR_COLOR[u.role] || "#64748b",
  };
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");
  const [, setTick] = useState(0);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "User" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState(null);

  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", role: "User" });
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoadingList(true);
    setListError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setListError(data.error || "Could not load users.");
        return;
      }
      setUsers(data.map(mapBackendUser));
    } catch {
      setListError("Cannot connect to server. Is the backend running?");
    } finally {
      setLoadingList(false);
    }
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name || !form.email) return;

    setCreating(true);
    setCreateError("");

    const trimmed = form.name.trim();
    const spaceIndex = trimmed.indexOf(" ");
    const firstName = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
    const lastName = spaceIndex === -1 ? trimmed : trimmed.slice(spaceIndex + 1);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName,
          lastName,
          email: form.email,
          role: form.role,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Could not create the account.");
        setCreating(false);
        return;
      }

      setUsers((prev) => [mapBackendUser(data.user || data), ...prev]);
      setCreatedCredentials({
        name: form.name,
        email: form.email,
        tempPassword: data.tempPassword || "ChangeMe123!",
      });
      setForm({ name: "", email: "", role: "User" });
      setShowModal(false);
    } catch {
      setCreateError("Cannot connect to server.");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(user) {
    setEditUser(user);
    setEditForm({
      firstName: user.firstName || user.name.split(" ")[0] || "",
      lastName: user.lastName || user.name.split(" ").slice(1).join(" ") || "",
      role: user.role,
    });
    setEditError("");
  }

  async function handleEdit(e) {
    e.preventDefault();
    if (!editUser) return;

    setEditing(true);
    setEditError("");

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          role: editForm.role,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Could not update user");
        setEditing(false);
        return;
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === editUser.id ? mapBackendUser(data) : u))
      );
      setEditUser(null);
    } catch {
      setEditError("Cannot connect to server");
    } finally {
      setEditing(false);
    }
  }

  async function handleToggleStatus(user) {
    const newStatus = user.status === "Active" ? "Disabled" : "Active";
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/api/users/${user.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Could not update status");
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: newStatus } : u))
      );
    } catch {
      alert("Cannot connect to server");
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Delete ${user.name}? This cannot be undone.`)) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/api/users/${user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Could not delete user");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch {
      alert("Cannot connect to server");
    }
  }

  async function handleResetPassword(user) {
    if (!window.confirm(`Reset password for ${user.name}?`)) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/api/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Could not reset password");
        return;
      }
      setCreatedCredentials({
        name: user.name,
        email: user.email,
        tempPassword: data.tempPassword || "ChangeMe123!",
      });
    } catch {
      alert("Cannot connect to server");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 className="page-heading">{t("userManagement")}</h2>
          <p className="page-subtext">
            {users.length} {t("accountsTotal")}
          </p>
        </div>
        <button
          className="btn btn-solid"
          style={{ padding: "10px 18px" }}
          onClick={() => setShowModal(true)}
        >
          + {t("addNewUser")}
        </button>
      </div>

      {createdCredentials && (
        <div className="panel" style={{ borderLeft: "4px solid #16a34a", marginBottom: 16 }}>
          <div className="panel-title" style={{ marginBottom: 8 }}>
            {t("credentialsFor")} {createdCredentials.name}
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 10 }}>
            {t("credentialsHint")}
          </p>
          <div style={{ fontFamily: "monospace", fontSize: "0.9rem" }}>
            <div>
              {t("email")}: {createdCredentials.email}
            </div>
            <div>
              {t("tempPassword")}: <b>{createdCredentials.tempPassword}</b>
            </div>
          </div>
          <button
            className="btn btn-outline"
            style={{ marginTop: 12 }}
            onClick={() => setCreatedCredentials(null)}
          >
            {t("gotIt")}
          </button>
        </div>
      )}

      {listError && (
        <div style={{ color: "#ef4444", marginBottom: 12, fontSize: "0.85rem" }}>
          {listError}
        </div>
      )}

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("userCol")}</th>
              <th>{t("emailAddress")}</th>
              <th>{t("role")}</th>
              <th>{t("status")}</th>
              <th>{t("storage")}</th>
              <th style={{ textAlign: "right" }}>{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loadingList && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                  {t("loadingUsers")}
                </td>
              </tr>
            )}
            {!loadingList &&
              users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="file-name-cell">
                      <span
                        className="avatar-circle"
                        style={{
                          background: u.color,
                          width: 30,
                          height: 30,
                          fontSize: "0.68rem",
                        }}
                      >
                        {u.initials}
                      </span>
                      {u.name}
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`tag ${ROLE_TAG_CLASS[u.role] || "tag-gray"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`tag ${u.status === "Active" ? "tag-green" : "tag-gray"}`}
                    >
                      {u.status === "Active" ? t("active") : t("disabled")}
                    </span>
                  </td>
                  <td>{u.storage}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-btn"
                        title={t("edit")}
                        onClick={() => openEdit(u)}
                      >
                        <EditIcon />
                      </button>
                      <button
                        className="icon-btn"
                        title={t("resetPassword")}
                        onClick={() => handleResetPassword(u)}
                      >
                        <KeyIcon />
                      </button>
                      <button
                        className="icon-btn"
                        title={u.status === "Active" ? t("disable") : t("enable")}
                        onClick={() => handleToggleStatus(u)}
                      >
                        <BlockIcon />
                      </button>
                      <button
                        className="icon-btn"
                        title={t("delete")}
                        onClick={() => handleDelete(u)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t("createUserTitle")}</div>
            <div className="modal-subtitle">{t("createUserSub")}</div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">{t("fullName")}</label>
                <input
                  className="form-input"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t("professionalEmail")}</label>
                <input
                  className="form-input"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t("role")}</label>
                <select
                  className="form-input"
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                >
                  <option value="User">User</option>
                  <option value="Manager">Manager</option>
                  <option value="Super Admin">Super Admin</option>
                </select>
              </div>
              {createError && (
                <div style={{ color: "#ef4444", marginBottom: 12, fontSize: "0.85rem" }}>
                  {createError}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowModal(false)}
                >
                  {t("cancel")}
                </button>
                <button type="submit" className="btn btn-solid" disabled={creating}>
                  {creating ? t("creating") : t("createAccount")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t("editUser")}</div>
            <div className="modal-subtitle">{editUser.email}</div>
            <form onSubmit={handleEdit}>
              <div className="form-group">
                <label className="form-label">{t("firstName")}</label>
                <input
                  className="form-input"
                  value={editForm.firstName}
                  onChange={(e) =>
                    setEditForm({ ...editForm, firstName: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t("lastName")}</label>
                <input
                  className="form-input"
                  value={editForm.lastName}
                  onChange={(e) =>
                    setEditForm({ ...editForm, lastName: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t("role")}</label>
                <select
                  className="form-input"
                  value={editForm.role}
                  onChange={(e) =>
                    setEditForm({ ...editForm, role: e.target.value })
                  }
                >
                  <option value="User">User</option>
                  <option value="Manager">Manager</option>
                  <option value="Super Admin">Super Admin</option>
                </select>
              </div>
              {editError && (
                <div style={{ color: "#ef4444", marginBottom: 12, fontSize: "0.85rem" }}>
                  {editError}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setEditUser(null)}
                >
                  {t("cancel")}
                </button>
                <button type="submit" className="btn btn-solid" disabled={editing}>
                  {editing ? t("saving") : t("saveChanges")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17 6l3 3M14 9l2 2" />
    </svg>
  );
}
function BlockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M5.5 5.5l13 13" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13" />
    </svg>
  );
}