// Capability catalogue and default roles. Client-safe.
import { METRIC_KEYS, NON_SENSITIVE_METRIC_KEYS } from "@/lib/metrics/catalog";

export const PERMISSIONS = {
  "reports.overview": { label: "Overview dashboard", category: "Reports", description: "View the performance overview dashboard." },
  "reports.creators": { label: "Creator reports", category: "Reports", description: "Search creators and view creator performance pages." },
  "reports.creatives": { label: "Creative reports & leaderboards", category: "Reports", description: "View creative-level performance, leaderboards and comparisons." },
  "reports.campaigns": { label: "Campaign reports", category: "Reports", description: "View campaign, ad set and ad-level reporting." },
  "reports.breakdowns": { label: "Breakdown reports", category: "Reports", description: "View placement, device, age, gender and geography breakdowns." },
  "reports.export": { label: "Export reports (CSV)", category: "Reports", description: "Download CSV exports of reports they can already see." },
  "creators.manage": { label: "Manage creators", category: "Creators", description: "Create and edit creators and creative assets." },
  "mapping.manage": { label: "Map ads to creators", category: "Creators", description: "Assign ads to creators, bulk reassign and manage naming rules." },
  "adaccounts.view": { label: "View ad accounts", category: "Meta", description: "View ad accounts and their synchronisation status." },
  "sync.trigger": { label: "Trigger manual sync", category: "Meta", description: "Queue a manual resynchronisation for accessible ad accounts." },
  "integrations.manage": { label: "Manage Meta integrations", category: "Administration", description: "Connect Meta, choose which ad accounts sync, disconnect." },
  "users.manage": { label: "Manage users & roles", category: "Administration", description: "Invite, suspend and configure users and roles." },
  "audit.view": { label: "View audit logs", category: "Administration", description: "Read the audit log." },
  "settings.manage": { label: "Manage settings", category: "Administration", description: "Edit reporting time zone, thresholds and metric catalogue." },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(k: string): k is PermissionKey {
  return k in PERMISSIONS;
}

export interface DefaultRole {
  key: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
  metrics: string[];
  allAdAccounts: boolean;
  allCreators: boolean;
  maxLookbackDays: number | null;
}

export const SUPER_ADMIN_ROLE = "super_admin";

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    key: SUPER_ADMIN_ROLE,
    name: "Super Admin",
    description: "Full access to every account, creator, metric, user, integration and setting.",
    permissions: [...PERMISSION_KEYS],
    metrics: [...METRIC_KEYS],
    allAdAccounts: true,
    allCreators: true,
    maxLookbackDays: null,
  },
  {
    key: "marketing_manager",
    name: "Marketing Manager",
    description: "Performance reporting for assigned ad accounts, with creator mapping.",
    permissions: [
      "reports.overview", "reports.creators", "reports.creatives", "reports.campaigns", "reports.breakdowns",
      "reports.export", "creators.manage", "mapping.manage", "adaccounts.view", "sync.trigger",
    ],
    metrics: [...METRIC_KEYS],
    allAdAccounts: false,
    allCreators: true,
    maxLookbackDays: null,
  },
  {
    key: "content_manager",
    name: "Content Team Manager",
    description: "Approved reports for assigned creators only, limited to admin-enabled metrics.",
    permissions: ["reports.overview", "reports.creators", "reports.creatives", "reports.export"],
    metrics: [...NON_SENSITIVE_METRIC_KEYS],
    allAdAccounts: true,
    allCreators: false,
    maxLookbackDays: 365,
  },
  {
    key: "creator_viewer",
    name: "Creator Viewer",
    description: "Read-only access to specifically assigned creators and approved metrics.",
    permissions: ["reports.creators"],
    metrics: ["impressions", "link_clicks", "ctr", "purchases", "roas", "video_3s_views", "hook_rate", "thruplays", "video_avg_time"],
    allAdAccounts: true,
    allCreators: false,
    maxLookbackDays: 90,
  },
];

/** Navigation items and the permission each requires. Rendered only when allowed. */
export const NAV_ITEMS: { href: string; label: string; permission: PermissionKey | PermissionKey[]; icon: string }[] = [
  { href: "/overview", label: "Overview", permission: "reports.overview", icon: "LayoutDashboard" },
  { href: "/creators", label: "Creators", permission: "reports.creators", icon: "Users" },
  { href: "/creatives", label: "Creatives", permission: ["reports.creatives", "mapping.manage"], icon: "Clapperboard" },
  { href: "/campaigns", label: "Campaigns", permission: "reports.campaigns", icon: "Megaphone" },
  { href: "/ad-accounts", label: "Ad Accounts", permission: "adaccounts.view", icon: "Building2" },
  { href: "/reports", label: "Reports", permission: ["reports.export", "reports.breakdowns"], icon: "FileBarChart" },
  { href: "/users", label: "User Management", permission: "users.manage", icon: "UserCog" },
  { href: "/integrations", label: "Integrations", permission: "integrations.manage", icon: "Plug" },
  { href: "/audit-logs", label: "Audit Logs", permission: "audit.view", icon: "ScrollText" },
  { href: "/settings", label: "Settings", permission: "settings.manage", icon: "Settings" },
];
