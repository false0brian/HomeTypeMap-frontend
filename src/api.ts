import type {
  AdminBlogPost,
  AdminBlogPostCreateInput,
  AdminFloorPlanPin,
  AdminFloorPlanPinCreateInput,
  AdminFloorPlanPinUpdateInput,
  AdminPortfolio,
  AdminPortfolioCreateInput,
  PublishStatus,
  ComplexDetailResponse,
  MapPinsResponse,
  NearbyComplexesResponse,
  PortfolioFilters,
  PortfolioListResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.detail === "string") return data.detail;
  } catch {
    // ignore json parse error
  }
  return fallback;
}

export interface BoundsQuery {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom: number;
}

function buildUrl(path: string, query?: Record<string, string>) {
  if (!query) {
    return `${API_BASE}${path}`;
  }
  const qs = new URLSearchParams(query).toString();
  return `${API_BASE}${path}?${qs}`;
}

function adminHeaders(adminKey: string) {
  return {
    "Content-Type": "application/json",
    "X-Admin-Key": adminKey,
  };
}

export async function fetchMapPins(bounds: BoundsQuery, vendorId?: number): Promise<MapPinsResponse> {
  const query: Record<string, string> = {
    south: String(bounds.south),
    west: String(bounds.west),
    north: String(bounds.north),
    east: String(bounds.east),
    zoom: String(bounds.zoom),
  };
  if (vendorId !== undefined) query.vendor_id = String(vendorId);
  const url = buildUrl("/map/pins", query);
  const res = await fetch(url);
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to fetch map pins"));
  return res.json();
}

export async function fetchNearbyComplexes(
  latitude: number,
  longitude: number,
  radiusM: number,
  vendorId?: number,
): Promise<NearbyComplexesResponse> {
  const query: Record<string, string> = {
    lat: String(latitude),
    lng: String(longitude),
    radius_m: String(radiusM),
  };
  if (vendorId !== undefined) query.vendor_id = String(vendorId);
  const res = await fetch(
    buildUrl("/map/nearby", query),
  );
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to fetch nearby complexes"));
  return res.json();
}

export async function fetchComplexDetail(complexId: number): Promise<ComplexDetailResponse> {
  const res = await fetch(buildUrl(`/complexes/${complexId}`));
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to fetch complex detail"));
  return res.json();
}

export async function fetchPortfolios(
  complexId: number,
  unitTypeId: number,
  filters: PortfolioFilters,
): Promise<PortfolioListResponse> {
  const query: Record<string, string> = {
    unit_type_id: String(unitTypeId),
    limit: "30",
    offset: "0",
  };

  if (filters.min_area !== undefined) query.min_area = String(filters.min_area);
  if (filters.max_area !== undefined) query.max_area = String(filters.max_area);
  if (filters.budget_min_krw !== undefined) query.budget_min_krw = String(filters.budget_min_krw);
  if (filters.budget_max_krw !== undefined) query.budget_max_krw = String(filters.budget_max_krw);
  if (filters.work_scope) query.work_scope = filters.work_scope;
  if (filters.style) query.style = filters.style;
  if (filters.vendor_id !== undefined) query.vendor_id = String(filters.vendor_id);

  const res = await fetch(buildUrl(`/complexes/${complexId}/portfolios`, query));
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to fetch portfolios"));
  return res.json();
}

export async function saveFavorite(userKey: string, portfolioId: number): Promise<void> {
  const res = await fetch(buildUrl("/favorites"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_key: userKey, portfolio_id: portfolioId }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to save favorite"));
}

export async function requestQuote(params: {
  userKey: string;
  vendorId?: number;
  portfolioId?: number;
  message?: string;
  preferredDate?: string;
}): Promise<void> {
  const res = await fetch(buildUrl("/quote-requests"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_key: params.userKey,
      vendor_id: params.vendorId,
      portfolio_id: params.portfolioId,
      message: params.message,
      preferred_date: params.preferredDate,
    }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to request quote"));
}

export async function adminListPortfolios(adminKey: string): Promise<AdminPortfolio[]> {
  const res = await fetch(buildUrl("/admin/portfolios"), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to fetch admin portfolios"));
  return res.json();
}

export async function adminCreatePortfolio(
  adminKey: string,
  payload: AdminPortfolioCreateInput,
): Promise<AdminPortfolio> {
  const res = await fetch(buildUrl("/admin/portfolios"), {
    method: "POST",
    headers: adminHeaders(adminKey),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to create portfolio"));
  return res.json();
}

export async function adminUpdatePortfolioStatus(
  adminKey: string,
  portfolioId: number,
  status: PublishStatus,
): Promise<AdminPortfolio> {
  const res = await fetch(buildUrl(`/admin/portfolios/${portfolioId}`), {
    method: "PATCH",
    headers: adminHeaders(adminKey),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to update portfolio"));
  return res.json();
}

export async function adminListBlogPosts(adminKey: string): Promise<AdminBlogPost[]> {
  const res = await fetch(buildUrl("/admin/blog-posts"), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to fetch blog posts"));
  return res.json();
}

export async function adminCreateBlogPost(
  adminKey: string,
  payload: AdminBlogPostCreateInput,
): Promise<AdminBlogPost> {
  const res = await fetch(buildUrl("/admin/blog-posts"), {
    method: "POST",
    headers: adminHeaders(adminKey),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to create blog post"));
  return res.json();
}

export async function adminUpdateBlogStatus(adminKey: string, postId: number, status: PublishStatus): Promise<AdminBlogPost> {
  const res = await fetch(buildUrl(`/admin/blog-posts/${postId}`), {
    method: "PATCH",
    headers: adminHeaders(adminKey),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to update blog post"));
  return res.json();
}

export async function adminListFloorPlanPins(adminKey: string, portfolioId: number): Promise<AdminFloorPlanPin[]> {
  const res = await fetch(buildUrl(`/admin/portfolios/${portfolioId}/floor-plan-pins`), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to fetch floor plan pins"));
  return res.json();
}

export async function adminCreateFloorPlanPin(
  adminKey: string,
  portfolioId: number,
  payload: AdminFloorPlanPinCreateInput,
): Promise<AdminFloorPlanPin> {
  const res = await fetch(buildUrl(`/admin/portfolios/${portfolioId}/floor-plan-pins`), {
    method: "POST",
    headers: adminHeaders(adminKey),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to create floor plan pin"));
  return res.json();
}

export async function adminUpdateFloorPlanPin(
  adminKey: string,
  pinId: number,
  payload: AdminFloorPlanPinUpdateInput,
): Promise<AdminFloorPlanPin> {
  const res = await fetch(buildUrl(`/admin/floor-plan-pins/${pinId}`), {
    method: "PATCH",
    headers: adminHeaders(adminKey),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to update floor plan pin"));
  return res.json();
}

export async function adminDeleteFloorPlanPin(adminKey: string, pinId: number): Promise<void> {
  const res = await fetch(buildUrl(`/admin/floor-plan-pins/${pinId}`), {
    method: "DELETE",
    headers: { "X-Admin-Key": adminKey },
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to delete floor plan pin"));
}
