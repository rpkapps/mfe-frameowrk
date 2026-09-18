import type { AppFinderTone } from "@tecton/react/tecton/app-finder"

export type AppCategory =
  | "Subsurface"
  | "Wells"
  | "Facilities"
  | "Economics"
  | "Operations"
  | "Data & Admin"

export type ShellApp = {
  id: string
  /** Short code shown in the app finder trigger. */
  code: string
  name: string
  description: string
  category: AppCategory
}

export type ShellUser = {
  name: string
  initials: string
  email: string
  role: string
}

export type ShellCommand = {
  id: string
  label: string
  group: "Navigate" | "Actions" | "Help"
  shortcut?: string
}

/** Tile colour of each category in the app finder and command palette. */
export const appTones: Record<AppCategory, AppFinderTone> = {
  Subsurface: "blue",
  Wells: "green",
  Facilities: "saffron",
  Economics: "violet",
  Operations: "red",
  "Data & Admin": "neutral",
}

export const appCategories: AppCategory[] = [
  "Subsurface",
  "Wells",
  "Facilities",
  "Economics",
  "Operations",
  "Data & Admin",
]

const app = (
  id: string,
  code: string,
  name: string,
  category: AppCategory,
  description: string
): ShellApp => ({ id, code, name, category, description })

/** A representative slice of a large app catalogue, grouped by category. */
export const apps: ShellApp[] = [
  app(
    "dsg",
    "DSG",
    "Discovery",
    "Subsurface",
    "Regional geology, fairway maps and prospect inventory"
  ),
  app(
    "fwm",
    "FWM",
    "Framework Modeling",
    "Subsurface",
    "Horizons, faults and the structural framework"
  ),
  app(
    "fcm",
    "FCM",
    "Facies Modeling",
    "Subsurface",
    "Facies belts, variograms and property models"
  ),
  app(
    "wcr",
    "WCR",
    "Well Correlation",
    "Subsurface",
    "Log correlation across wells and markers"
  ),
  app(
    "vol",
    "VOL",
    "Volumetrics",
    "Subsurface",
    "In-place volumes and uncertainty ranges"
  ),
  app(
    "dwp",
    "DWP",
    "Well Planning",
    "Wells",
    "Well design, casing schematics and design comparison"
  ),
  app(
    "trj",
    "TRJ",
    "Trajectory Design",
    "Wells",
    "Planned trajectories, targets and anti-collision"
  ),
  app(
    "cmp",
    "CMP",
    "Completions",
    "Wells",
    "Completion design and lower-completion equipment"
  ),
  app(
    "dfr",
    "DFR",
    "Drilling Reports",
    "Wells",
    "Daily drilling reports and rig activity"
  ),
  app(
    "aam",
    "AAM",
    "Asset Management",
    "Facilities",
    "Field development alternatives and decision gates"
  ),
  app(
    "sub",
    "SUB",
    "Subsea Layout",
    "Facilities",
    "Templates, manifolds, flowlines and umbilicals"
  ),
  app(
    "hst",
    "HST",
    "Host Selection",
    "Facilities",
    "Host capacity, tie-back distance and tariff cases"
  ),
  app(
    "flw",
    "FLW",
    "Flow Assurance",
    "Facilities",
    "Hydrate, wax and slugging screening"
  ),
  app(
    "eco",
    "ECO",
    "Economics",
    "Economics",
    "Cost, schedule and NPV of the active concepts"
  ),
  app(
    "cst",
    "CST",
    "Cost Estimating",
    "Economics",
    "Class estimates and cost breakdown structures"
  ),
  app(
    "rsk",
    "RSK",
    "Risk Register",
    "Economics",
    "Project risks, owners and mitigations"
  ),
  app(
    "ops",
    "OPS",
    "Operations",
    "Operations",
    "Production surveillance and well status"
  ),
  app(
    "mnt",
    "MNT",
    "Maintenance",
    "Operations",
    "Work orders and integrity inspections"
  ),
  app(
    "hse",
    "HSE",
    "HSE Reporting",
    "Operations",
    "Incidents, observations and safety KPIs"
  ),
  app(
    "dat",
    "DAT",
    "Data Catalogue",
    "Data & Admin",
    "Datasets, lineage and quality checks"
  ),
  app(
    "adm",
    "ADM",
    "Administration",
    "Data & Admin",
    "Users, roles and application access"
  ),
  app(
    "rel",
    "REL",
    "Release Notes",
    "Data & Admin",
    "What changed across the platform"
  ),
]

export const recentAppIds = ["dwp", "aam", "dsg"]

export const currentUser: ShellUser = {
  name: "Sarah Elliott",
  initials: "SE",
  email: "sarah.elliott@argonaut.example",
  role: "Drilling engineer",
}

export const commands: ShellCommand[] = [
  { id: "go-wells", label: "Go to wells", group: "Navigate", shortcut: "G W" },
  {
    id: "go-projects",
    label: "Go to projects",
    group: "Navigate",
    shortcut: "G P",
  },
  { id: "go-map", label: "Open fairway map", group: "Navigate" },
  { id: "new-well", label: "Create well", group: "Actions", shortcut: "N" },
  { id: "new-design", label: "New design", group: "Actions" },
  { id: "publish", label: "Review and publish", group: "Actions" },
  { id: "release-notes", label: "What's new", group: "Help" },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    group: "Help",
    shortcut: "?",
  },
  { id: "bug", label: "Report a bug", group: "Help" },
]

/** Groups apps by category, keeping the catalogue's category order. */
export function groupApps(list: ShellApp[]) {
  return appCategories
    .map((category) => ({
      category,
      apps: list.filter((item) => item.category === category),
    }))
    .filter((group) => group.apps.length > 0)
}
