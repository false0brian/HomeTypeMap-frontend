export type WorkScopeType = "kitchen" | "bathroom" | "partial" | "full_remodeling";
export type PublishStatus = "draft" | "review" | "published";

export interface ClusterPin {
  cluster_key: string;
  center_latitude: number;
  center_longitude: number;
  count: number;
}

export interface ComplexPin {
  complex_id: number;
  name: string;
  latitude: number;
  longitude: number;
  portfolio_count: number;
  distance_m?: number | null;
}

export interface MapPinsResponse {
  clusters: ClusterPin[];
  complexes: ComplexPin[];
}

export interface NearbyComplexesResponse {
  center_latitude: number;
  center_longitude: number;
  radius_m: number;
  items: ComplexPin[];
}

export interface UnitTypeChip {
  unit_type_id: number;
  exclusive_area_m2: number;
  type_code?: string | null;
  room_count?: number | null;
  bathroom_count?: number | null;
  structure_keyword?: string | null;
  floor_plan_image_url?: string | null;
  portfolio_count: number;
}

export interface ComplexDetailResponse {
  complex_id: number;
  name: string;
  address: string;
  built_year?: number | null;
  household_count?: number | null;
  unit_types: UnitTypeChip[];
}

export interface FloorPlanPin {
  pin_id: string;
  x: number;
  y: number;
  title?: string | null;
  before_image_urls?: string[] | null;
  after_image_urls?: string[] | null;
}

export interface PortfolioCard {
  portfolio_id: number;
  title: string;
  before_image_url?: string | null;
  after_image_url?: string | null;
  before_image_urls?: string[] | null;
  after_image_urls?: string[] | null;
  floor_plan_pin_x?: number | null;
  floor_plan_pin_y?: number | null;
  floor_plan_pins?: FloorPlanPin[] | null;
  work_scope: WorkScopeType;
  style: string;
  budget_min_krw?: number | null;
  budget_max_krw?: number | null;
  duration_days?: number | null;
  vendor_id?: number | null;
  vendor_name?: string | null;
}

export interface PortfolioListResponse {
  items: PortfolioCard[];
  total: number;
}

export interface PortfolioFilters {
  min_area?: number;
  max_area?: number;
  budget_min_krw?: number;
  budget_max_krw?: number;
  work_scope?: WorkScopeType;
  style?: string;
  vendor_id?: number;
}

export interface AuthUser {
  user_id: number;
  email: string;
  display_name: string;
  user_key: string;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
  user: AuthUser;
}

export interface QuoteRequestResponse {
  quote_request_id: number;
  user_key: string;
  requester_name?: string | null;
  requester_email?: string | null;
  vendor_id?: number | null;
  portfolio_id?: number | null;
  created_at: string;
}

export interface AdminPortfolio {
  portfolio_id: number;
  complex_id: number;
  unit_type_id: number;
  vendor_id?: number | null;
  title: string;
  work_scope: string;
  style: string;
  status: PublishStatus;
  budget_min_krw?: number | null;
  budget_max_krw?: number | null;
  duration_days?: number | null;
  published_at?: string | null;
  created_at: string;
}

export interface AdminPortfolioCreateInput {
  complex_id: number;
  unit_type_id: number;
  vendor_id?: number;
  title: string;
  work_scope: string;
  style: string;
  status: PublishStatus;
}

export interface AdminFloorPlanPin {
  pin_id: number;
  portfolio_id: number;
  x_ratio: number;
  y_ratio: number;
  title?: string | null;
  sort_order: number;
  before_image_urls: string[];
  after_image_urls: string[];
}

export interface AdminFloorPlanPinCreateInput {
  x_ratio: number;
  y_ratio: number;
  title?: string;
  sort_order: number;
  before_image_urls: string[];
  after_image_urls: string[];
}

export interface AdminFloorPlanPinUpdateInput {
  x_ratio?: number;
  y_ratio?: number;
  title?: string;
  sort_order?: number;
  before_image_urls?: string[];
  after_image_urls?: string[];
}

export interface AdminBlogPost {
  post_id: number;
  vendor_id?: number | null;
  title: string;
  slug: string;
  excerpt?: string | null;
  content: string;
  status: PublishStatus;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminBlogPostCreateInput {
  vendor_id?: number;
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
  status: PublishStatus;
}
