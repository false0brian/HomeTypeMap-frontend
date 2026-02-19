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

export interface PortfolioCard {
  portfolio_id: number;
  title: string;
  before_image_url?: string | null;
  after_image_url?: string | null;
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
