import { ApiError, apiFetch, USERS_API } from "@/lib/api/client";
import { readBody } from "@/lib/api/envelope";
import type { Profile } from "@/lib/profile";

// user-svc, through /api/users: identity, and Orblode's projects under /orblode/*.

export type LoginResponse = Profile;

export interface Project {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  lifecycle_status: string;
  center_lat: number | null;
  center_lng: number | null;
  center_height: number | null;
  location_name: string | null;
  crs_epsg: number | null;
  crs_label: string | null;
  crs_units: string | null;
  vertical_datum: string | null;
  primary_material: string | null;
  created_at: string;
  updated_at: string;
}

/** Signs in through the BFF, which keeps the token in an httpOnly cookie and answers with who signed in. */
export async function login(email: string, password: string, remember = false): Promise<LoginResponse> {
  let res: Response;
  try {
    res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember }),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(502, "We couldn't reach Orblode. Check your connection and try again.");
  }
  return readBody<LoginResponse>(res.status, res.ok, await res.text());
}

export function listProjects(): Promise<Project[]> {
  return apiFetch<Project[]>(USERS_API, "/orblode/projects");
}

export function getProject(id: string): Promise<Project> {
  return apiFetch<Project>(USERS_API, `/orblode/projects/${encodeURIComponent(id)}`);
}

/** Body for POST /orblode/projects. Geo/CRS fields are optional; orblode-svc snapshots crs_epsg and
 * vertical_datum onto each new survey as its working CRS. */
export interface CreateProjectRequest {
  name: string;
  description?: string;
  location_name?: string;
  crs_epsg?: number;
  crs_label?: string;
  vertical_datum?: string;
  primary_material?: string;
}

export function createProject(req: CreateProjectRequest): Promise<Project> {
  return apiFetch<Project>(USERS_API, "/orblode/projects", { method: "POST", body: req });
}
