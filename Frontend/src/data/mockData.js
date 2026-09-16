// Central mock data for SecureDrive (no backend yet — everything lives here in memory)

export const ROLES = {
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Manager",
  USER: "User",
};

// The person currently "logged in". Change `role` here to preview each role's sidebar.
export const currentUser = {
  id: "u1",
  firstName: "Sarah",
  lastName: "Chen",
  fullName: "Sarah Chen",
  initials: "SC",
  email: "sarah.chen@tentee.com",
  role: ROLES.SUPER_ADMIN,
  employeeId: "EMP-1",
  department: "IT Administration",
  status: "Active",
  storageUsedGB: 2.1,
  storageTotalGB: 25,
  filesOwned: 47,
  sharedByMeCount: 12,
  lastLogin: "2 hours ago",
  avatarColor: "#2563eb",
};

export const initialUsers = [
  { id: "u1", name: "Sarah Chen", email: "sarah.chen@tentee.com", role: ROLES.SUPER_ADMIN, status: "Active", storage: "2.1 GB", initials: "SC", color: "#2563eb" },
  { id: "u2", name: "Marc Andreessen", email: "marc@tentee.com", role: ROLES.MANAGER, status: "Active", storage: "5.4 GB", initials: "MA", color: "#7c3aed" },
  { id: "u3", name: "James Okafor", email: "j.okafor@tentee.com", role: ROLES.USER, status: "Active", storage: "1.2 GB", initials: "JO", color: "#0891b2" },
  { id: "u4", name: "Léa Dupont", email: "lea.dupont@tentee.com", role: ROLES.EDITOR, status: "Active", storage: "3.6 GB", initials: "LD", color: "#d97706" },
  { id: "u5", name: "Priya Sharma", email: "p.sharma@tentee.com", role: ROLES.USER, status: "Disabled", storage: "0.8 GB", initials: "PS", color: "#64748b" },
  { id: "u6", name: "Daniel Müller", email: "d.muller@tentee.com", role: ROLES.EDITOR, status: "Active", storage: "4.1 GB", initials: "DM", color: "#d97706" },
  { id: "u7", name: "Ali Hassan", email: "ali.hassan@tentee.com", role: ROLES.USER, status: "Active", storage: "0.3 GB", initials: "AH", color: "#0891b2" },
  { id: "u8", name: "Fatima Al-Hassan", email: "fatima@tentee.com", role: ROLES.MANAGER, status: "Active", storage: "2.9 GB", initials: "FA", color: "#7c3aed" },
];

export const initialFiles = [
  { id: "f1", name: "System_Architecture_Doc.pdf", type: "pdf", size: "3.4 MB", modified: "Jul 15, 2026", starred: false },
  { id: "f2", name: "Database_Schema.png", type: "image", size: "1.8 MB", modified: "Jul 18, 2026", starred: true },
  { id: "f3", name: "Frontend_Component_Specs.docx", type: "doc", size: "850 KB", modified: "Jul 20, 2026", starred: false },
  { id: "f4", name: "App_Config.json", type: "code", size: "12 KB", modified: "Yesterday", starred: false },
];

export const sharedWithMe = [
  { id: "s1", name: "Rapport_Q2.pdf", sharedBy: "Marc Andreessen", permission: "Read Only", date: "10 min ago" },
  { id: "s2", name: "Projet_Cantel.docx", sharedBy: "James Okafor", permission: "Read & Write", date: "3 hours ago" },
  { id: "s3", name: "Security_Policy.pdf", sharedBy: "Sarah Chen", permission: "Read Only", date: "1 day ago" },
];

export const sharedByMe = [
  { id: "b1", name: "Q2 Report.xlsx", sharedWith: "James Okafor", permission: "Read Only", date: "10 min ago" },
  { id: "b2", name: "Onboarding_Guide.pdf", sharedWith: "Léa Dupont", permission: "Read & Write", date: "2 days ago" },
];

export const recentFiles = [
  { id: "r1", name: "Engineering Projects", type: "folder", owner: "Sarah Chen", date: "1 day ago" },
  { id: "r2", name: "Q2 Financial Report.xlsx", type: "sheet", owner: "Priya Sharma", date: "1 day ago", size: "4.6 MB" },
  { id: "r3", name: "Product Roadmap 2026.pptx", type: "slides", owner: "Sarah Chen", date: "3 days ago", size: "12.0 MB" },
  { id: "r4", name: "Architecture Diagrams", type: "folder", owner: "Sarah Chen", date: "3 days ago" },
  { id: "r5", name: "SecureDrive API Spec.pdf", type: "pdf", owner: "James Holloway", date: "5 days ago", size: "2.0 MB" },
];

export const favoriteFiles = [
  { id: "fav1", name: "Database_Schema.png", type: "image", modified: "Jul 18, 2026" },
];

export const trashItems = [
  { id: "t1", name: "Old_Project_Draft.docx", location: "My Files", size: "1.2 MB", deleted: "2 days ago" },
  { id: "t2", name: "Logo_Mockup_v1.png", location: "Design / Assets", size: "4.5 MB", deleted: "5 days ago" },
  { id: "t3", name: "Q1_Backup_2025.zip", location: "Archives", size: "128.0 MB", deleted: "12 days ago" },
];

export const activityLog = [
  { id: "a1", user: "Marc Andreessen", action: "shared \"Q2 Report.xlsx\" with James Okafor", tag: "Share", date: "10 min ago" },
  { id: "a2", user: "Sarah Chen", action: "created account for Ali Hassan", tag: "Admin", date: "2 hours ago" },
  { id: "a3", user: "James Okafor", action: "uploaded \"Contracts Archive.zip\"", tag: "Upload", date: "5 hours ago" },
  { id: "a4", user: "Sarah Chen", action: "reset password for Léa Dupont", tag: "Security", date: "1 day ago" },
  { id: "a5", user: "Priya Sharma", action: "deleted \"Old Draft.docx\"", tag: "Delete", date: "1 day ago" },
  { id: "a6", user: "Daniel Müller", action: "downloaded \"Security Audit Report.pdf\"", tag: "Download", date: "2 days ago" },
  { id: "a7", user: "Sarah Chen", action: "disabled account for Priya Sharma", tag: "Admin", date: "3 days ago" },
];

export const notifications = [
  { id: "n1", title: "File Shared With You", detail: "Marc Andreessen shared \"Q2 Report.xlsx\"", date: "10 min ago" },
  { id: "n2", title: "Permission Updated", detail: "Your access to \"Projet_Cantel.docx\" changed", date: "2 days ago" },
  { id: "n3", title: "Storage Alert", detail: "You are using 87% of your storage quota", date: "3 days ago" },
];

export const recentShares = [
  { id: "rs1", from: "Marc Andreessen", to: "James Okafor", file: "Rapport_Q2.pdf", permission: "Read Only" },
  { id: "rs2", from: "James Okafor", to: "Marc Andreessen", file: "Projet_Cantel.docx", permission: "Read & Write" },
  { id: "rs3", from: "Sarah Chen", to: "Léa Dupont", file: "Security_Policy.pdf", permission: "Read Only" },
];

export const dashboardStats = {
  totalUsers: 8,
  activeAccounts: 7,
  storageUsedGB: 21.8,
  actionsToday: 7,
};
