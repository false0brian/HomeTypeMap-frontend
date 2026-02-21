import { useEffect, useMemo, useRef, useState } from "react";
import * as L from "leaflet";

import {
  fetchMe,
  fetchComplexDetail,
  login,
  logout,
  fetchMapPins,
  fetchNearbyComplexes,
  fetchPortfolios,
  requestQuote,
  saveFavorite,
  signup,
  type BoundsQuery,
} from "./api";
import type {
  AuthUser,
  ClusterPin,
  ComplexDetailResponse,
  ComplexPin,
  FloorPlanPin as FloorPlanPinData,
  PortfolioCard,
  PortfolioFilters,
  UnitTypeChip,
  WorkScopeType,
} from "./types";

const DEFAULT_BOUNDS: BoundsQuery = {
  south: 37.4,
  west: 127.0,
  north: 37.6,
  east: 127.2,
  zoom: 13,
};

const DEFAULT_CENTER: L.LatLngExpression = [37.4875, 127.1022];
const DEFAULT_FILTERS: PortfolioFilters = {};
const SAMPLE_FLOOR_PLAN_URL = "https://placehold.co/960x640/eef3ea/2b4b3e?text=Sample+Floor+Plan";
const FAVORITE_VENDOR_IDS_KEY = "hometypemap.favorite_vendor_ids";
const AUTO_FAVORITE_VENDOR_KEY = "hometypemap.auto_favorite_vendor_filter";
const AUTH_TOKEN_KEY = "planifit.auth.token";

type MapMode = "bounds" | "nearby";
type CardImageSide = "before" | "after";
type FloorPin = {
  portfolioId: number;
  pinId: string;
  x: number;
  y: number;
  title?: string | null;
  beforeImageUrls: string[];
  afterImageUrls: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function priceLabel(min?: number | null, max?: number | null) {
  if (min == null && max == null) return "시공비 미공개";
  const lo = min == null ? "-" : `${Math.round(min / 10000).toLocaleString()}만원`;
  const hi = max == null ? "-" : `${Math.round(max / 10000).toLocaleString()}만원`;
  return lo === hi ? lo : `${lo} ~ ${hi}`;
}

function workScopeLabel(scope: WorkScopeType) {
  if (scope === "full_remodeling") return "전체 리모델링";
  if (scope === "partial") return "부분 공사";
  if (scope === "kitchen") return "주방";
  return "욕실";
}

function cardSummary(card: PortfolioCard) {
  const duration = card.duration_days ? `${card.duration_days}일` : "기간 미정";
  const vendor = card.vendor_name ?? "업체 미지정";
  return `시공비 ${priceLabel(card.budget_min_krw, card.budget_max_krw)} · ${workScopeLabel(card.work_scope)} · ${duration} · ${vendor}`;
}

function formatDateTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function defaultImageSide(card: PortfolioCard): CardImageSide | null {
  if (card.after_image_url) return "after";
  if (card.before_image_url) return "before";
  return "after";
}

function sampleBeforeUrl(portfolioId: number) {
  return `https://placehold.co/960x640/f4efe8/3f3a34?text=Before+Sample+${portfolioId}`;
}

function sampleAfterUrl(portfolioId: number) {
  return `https://placehold.co/960x640/e8f4eb/254739?text=After+Sample+${portfolioId}`;
}

function sampleBeforeUrls(portfolioId: number): string[] {
  return [
    sampleBeforeUrl(portfolioId),
    `https://placehold.co/960x640/f0ebe4/4a433c?text=Before+Detail+${portfolioId}-2`,
    `https://placehold.co/960x640/e9e3dc/4e443b?text=Before+Detail+${portfolioId}-3`,
  ];
}

function sampleAfterUrls(portfolioId: number): string[] {
  return [
    sampleAfterUrl(portfolioId),
    `https://placehold.co/960x640/e3f0e7/23513c?text=After+Detail+${portfolioId}-2`,
    `https://placehold.co/960x640/dfece4/1f4b36?text=After+Detail+${portfolioId}-3`,
  ];
}

function fallbackFloorPin(portfolioId: number): { x: number; y: number } {
  const baseX = 18 + (portfolioId * 17 % 64);
  const baseY = 16 + (portfolioId * 13 % 66);
  return { x: Math.min(92, baseX + 3), y: Math.min(92, baseY + 2) };
}

function imageList(card: PortfolioCard, side: CardImageSide): string[] {
  const urls = side === "before" ? card.before_image_urls : card.after_image_urls;
  if (urls && urls.length > 0) return urls;
  const single = side === "before" ? card.before_image_url : card.after_image_url;
  if (single) {
    const fallback = side === "before" ? sampleBeforeUrls(card.portfolio_id) : sampleAfterUrls(card.portfolio_id);
    return [single, ...fallback.slice(1)];
  }
  return side === "before" ? sampleBeforeUrls(card.portfolio_id) : sampleAfterUrls(card.portfolio_id);
}

function pinImageList(pin: FloorPlanPinData | undefined, side: CardImageSide, portfolioId: number): string[] {
  const urls = side === "before" ? pin?.before_image_urls : pin?.after_image_urls;
  if (urls && urls.length > 0) return urls;
  return side === "before" ? sampleBeforeUrls(portfolioId) : sampleAfterUrls(portfolioId);
}

function markerIcon(className: string, text: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="${className}">${text}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const cardsRef = useRef<HTMLDivElement | null>(null);

  const [bounds, setBounds] = useState<BoundsQuery>(DEFAULT_BOUNDS);
  const [clusters, setClusters] = useState<ClusterPin[]>([]);
  const [complexes, setComplexes] = useState<ComplexPin[]>([]);

  const [selectedComplex, setSelectedComplex] = useState<ComplexDetailResponse | null>(null);
  const [selectedUnitType, setSelectedUnitType] = useState<UnitTypeChip | null>(null);
  const [portfolios, setPortfolios] = useState<PortfolioCard[]>([]);

  const [filters, setFilters] = useState<PortfolioFilters>(DEFAULT_FILTERS);

  const [authToken, setAuthToken] = useState("");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [loadingMap, setLoadingMap] = useState(false);
  const [loadingPortfolios, setLoadingPortfolios] = useState(false);
  const [status, setStatus] = useState<string>("지도를 초기화하는 중입니다.");

  const [mapMode, setMapMode] = useState<MapMode>("bounds");
  const [highlightList, setHighlightList] = useState(false);
  const [nearbyRadiusM, setNearbyRadiusM] = useState(3000);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedCardImages, setSelectedCardImages] = useState<Record<number, CardImageSide>>({});
  const [selectedPinnedPortfolioId, setSelectedPinnedPortfolioId] = useState<number | null>(null);
  const [selectedFloorPinId, setSelectedFloorPinId] = useState<string | null>(null);
  const [gallerySide, setGallerySide] = useState<CardImageSide>("after");
  const [vendorSearch, setVendorSearch] = useState("");
  const [favoriteVendorIds, setFavoriteVendorIds] = useState<number[]>([]);
  const [autoFavoriteVendorFilter, setAutoFavoriteVendorFilter] = useState(true);
  const [savedPortfolioIds, setSavedPortfolioIds] = useState<number[]>([]);
  const [quotedPortfolioIds, setQuotedPortfolioIds] = useState<number[]>([]);
  const [actionNotice, setActionNotice] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const [quoteModalCard, setQuoteModalCard] = useState<PortfolioCard | null>(null);
  const [quoteMessage, setQuoteMessage] = useState("");
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);

  const syncBoundsFromMap = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    setBounds({
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
      zoom: map.getZoom(),
    });
  };

  useEffect(() => {
    const stored = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!stored) return;
    setAuthToken(stored);
  }, []);

  useEffect(() => {
    if (!authToken) {
      setCurrentUser(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const me = await fetchMe(authToken);
        if (cancelled) return;
        setCurrentUser(me);
        window.localStorage.setItem(AUTH_TOKEN_KEY, authToken);
      } catch {
        if (cancelled) return;
        setCurrentUser(null);
        setAuthToken("");
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_BOUNDS.zoom,
      minZoom: 7,
      maxZoom: 18,
      zoomControl: false,
    });

    mapRef.current = map;
    markerLayerRef.current = L.layerGroup().addTo(map);
    userLayerRef.current = L.layerGroup().addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    map.on("moveend", syncBoundsFromMap);
    map.on("zoomend", syncBoundsFromMap);
    syncBoundsFromMap();

    setStatus("지도 준비 완료. 핀을 선택하세요.");

    return () => {
      map.off("moveend", syncBoundsFromMap);
      map.off("zoomend", syncBoundsFromMap);
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      userLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITE_VENDOR_IDS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map((x) => Number(x))
          .filter((x) => Number.isInteger(x) && x > 0);
        setFavoriteVendorIds(normalized);
      }
    } catch {
      // ignore localStorage parse errors
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(FAVORITE_VENDOR_IDS_KEY, JSON.stringify(favoriteVendorIds));
  }, [favoriteVendorIds]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AUTO_FAVORITE_VENDOR_KEY);
      if (!raw) return;
      setAutoFavoriteVendorFilter(raw === "1");
    } catch {
      // ignore localStorage read errors
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(AUTO_FAVORITE_VENDOR_KEY, autoFavoriteVendorFilter ? "1" : "0");
  }, [autoFavoriteVendorFilter]);

  const effectiveVendorId = useMemo(
    () => filters.vendor_id ?? (autoFavoriteVendorFilter ? favoriteVendorIds[0] : undefined),
    [filters.vendor_id, autoFavoriteVendorFilter, favoriteVendorIds],
  );

  const resolvedFilters = useMemo(
    () => ({ ...filters, vendor_id: effectiveVendorId }),
    [filters, effectiveVendorId],
  );

  useEffect(() => {
    if (mapMode !== "bounds") return;

    let cancelled = false;

    const loadPins = async () => {
      if (!mapRef.current) return;
      setLoadingMap(true);
      try {
        const data = await fetchMapPins(bounds, {
          vendor_id: effectiveVendorId,
          work_scope: filters.work_scope,
          min_area: filters.min_area,
        });
        if (cancelled) return;
        setClusters(data.clusters);
        setComplexes(data.complexes);
      } catch (e) {
        if (cancelled) return;
        setStatus(e instanceof Error ? e.message : "지도 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoadingMap(false);
      }
    };

    const id = setTimeout(loadPins, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [bounds, mapMode, effectiveVendorId, filters.work_scope, filters.min_area]);

  useEffect(() => {
    const layer = userLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!userLocation) return;

    L.circle([userLocation.latitude, userLocation.longitude], {
      radius: nearbyRadiusM,
      color: "#325f8c",
      weight: 2,
      fillColor: "#325f8c",
      fillOpacity: 0.12,
    }).addTo(layer);

    L.marker([userLocation.latitude, userLocation.longitude], {
      icon: markerIcon("user-dot", "내"),
    }).addTo(layer);
  }, [userLocation, nearbyRadiusM]);

  useEffect(() => {
    if (!mapRef.current || !markerLayerRef.current) return;

    const map = mapRef.current;
    const layer = markerLayerRef.current;
    layer.clearLayers();

    clusters.forEach((cluster) => {
      const marker = L.marker([cluster.center_latitude, cluster.center_longitude], {
        icon: markerIcon("cluster-badge", String(cluster.count)),
      });
      marker.on("click", () => {
        map.setView([cluster.center_latitude, cluster.center_longitude], clamp(map.getZoom() + 2, 7, 18));
      });
      marker.addTo(layer);
    });

    complexes.forEach((pin) => {
      const active = selectedComplex?.complex_id === pin.complex_id;
      const badgeText = pin.distance_m != null ? `${Math.max(1, Math.round(pin.distance_m / 100))}` : String(pin.portfolio_count);
      const marker = L.marker([pin.latitude, pin.longitude], {
        icon: markerIcon(active ? "complex-dot active" : "complex-dot", badgeText),
      });
      marker.on("click", () => {
        map.panTo([pin.latitude, pin.longitude]);
        void handleSelectComplex(pin.complex_id, true);
      });
      marker.addTo(layer);
    });
  }, [clusters, complexes, selectedComplex]);

  useEffect(() => {
    if (!selectedComplex || !selectedUnitType) return;

    let cancelled = false;
    const run = async () => {
      setLoadingPortfolios(true);
      setStatus("포트폴리오를 조회 중입니다.");
      try {
        const data = await fetchPortfolios(selectedComplex.complex_id, selectedUnitType.unit_type_id, resolvedFilters);
        if (cancelled) return;
        setPortfolios(data.items);
        if (highlightList) {
          cardsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        }
      } catch (e) {
        if (cancelled) return;
        setStatus(e instanceof Error ? e.message : "포트폴리오를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoadingPortfolios(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedComplex, selectedUnitType, resolvedFilters, highlightList]);

  useEffect(() => {
    if (!highlightList) return;
    const timer = window.setTimeout(() => setHighlightList(false), 900);
    return () => window.clearTimeout(timer);
  }, [highlightList]);

  useEffect(() => {
    setSelectedCardImages((prev) => {
      const next: Record<number, CardImageSide> = {};
      portfolios.forEach((card) => {
        const selected = prev[card.portfolio_id];
        if (selected === "before" || selected === "after") {
          next[card.portfolio_id] = selected;
          return;
        }
        const fallback = defaultImageSide(card);
        if (fallback) next[card.portfolio_id] = fallback;
      });
      return next;
    });
  }, [portfolios]);

  useEffect(() => {
    if (selectedPinnedPortfolioId == null) return;
    if (portfolios.some((x) => x.portfolio_id === selectedPinnedPortfolioId)) return;
    setSelectedPinnedPortfolioId(null);
    setSelectedFloorPinId(null);
  }, [portfolios, selectedPinnedPortfolioId]);

  useEffect(() => {
    setSelectedPinnedPortfolioId(null);
    setSelectedFloorPinId(null);
  }, [selectedUnitType?.unit_type_id]);

  const unitTypeButtons = useMemo(() => selectedComplex?.unit_types ?? [], [selectedComplex]);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: keyof PortfolioFilters; label: string }> = [];
    if (filters.work_scope) chips.push({ key: "work_scope", label: `공사범위 ${workScopeLabel(filters.work_scope)}` });
    if (filters.min_area !== undefined) chips.push({ key: "min_area", label: `최소평형 ${filters.min_area}` });
    if (effectiveVendorId !== undefined) {
      chips.push({
        key: "vendor_id",
        label: `${filters.vendor_id !== undefined ? "업체" : "즐겨찾기 업체"} #${effectiveVendorId}`,
      });
    }
    return chips;
  }, [filters, effectiveVendorId]);

  const vendorChips = useMemo(() => {
    const map = new Map<number, { vendorId: number; name: string; count: number; favorite: boolean }>();
    portfolios.forEach((card) => {
      if (!card.vendor_id) return;
      const next = map.get(card.vendor_id) ?? {
        vendorId: card.vendor_id,
        name: card.vendor_name ?? `업체 #${card.vendor_id}`,
        count: 0,
        favorite: favoriteVendorIds.includes(card.vendor_id),
      };
      next.count += 1;
      map.set(card.vendor_id, next);
    });
    const items = Array.from(map.values())
      .filter((x) => x.name.toLowerCase().includes(vendorSearch.toLowerCase()))
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return b.count - a.count || a.vendorId - b.vendorId;
      });
    if (effectiveVendorId !== undefined && !map.has(effectiveVendorId)) {
      items.unshift({
        vendorId: effectiveVendorId,
        name: `업체 #${effectiveVendorId}`,
        count: 0,
        favorite: favoriteVendorIds.includes(effectiveVendorId),
      });
    }
    return items;
  }, [portfolios, effectiveVendorId, vendorSearch, favoriteVendorIds]);

  const selectedDistance = useMemo(() => {
    if (!selectedComplex) return null;
    return complexes.find((x) => x.complex_id === selectedComplex.complex_id)?.distance_m ?? null;
  }, [complexes, selectedComplex]);

  const selectedFloorPlanImage = useMemo(() => {
    return selectedUnitType?.floor_plan_image_url || SAMPLE_FLOOR_PLAN_URL;
  }, [selectedUnitType]);

  const floorPlanPins = useMemo<FloorPin[]>(() => {
    const pins: FloorPin[] = [];
    portfolios.forEach((card) => {
      if (card.floor_plan_pins && card.floor_plan_pins.length > 0) {
        card.floor_plan_pins.forEach((pin) => {
          pins.push({
            portfolioId: card.portfolio_id,
            pinId: pin.pin_id,
            title: pin.title,
            x: pin.x,
            y: pin.y,
            beforeImageUrls: pinImageList(pin, "before", card.portfolio_id),
            afterImageUrls: pinImageList(pin, "after", card.portfolio_id),
          });
        });
        return;
      }
      pins.push({
        portfolioId: card.portfolio_id,
        pinId: `${card.portfolio_id}-pin-1`,
        title: "포인트 1",
        x: card.floor_plan_pin_x ?? fallbackFloorPin(card.portfolio_id).x,
        y: card.floor_plan_pin_y ?? fallbackFloorPin(card.portfolio_id).y,
        beforeImageUrls: imageList(card, "before"),
        afterImageUrls: imageList(card, "after"),
      });
    });
    return pins;
  }, [portfolios]);

  useEffect(() => {
    if (selectedPinnedPortfolioId == null) return;
    if (selectedFloorPinId) return;
    const firstPin = floorPlanPins.find((x) => x.portfolioId === selectedPinnedPortfolioId);
    if (firstPin) setSelectedFloorPinId(firstPin.pinId);
  }, [selectedPinnedPortfolioId, selectedFloorPinId, floorPlanPins]);

  const selectedPinnedCard = useMemo(
    () => portfolios.find((x) => x.portfolio_id === selectedPinnedPortfolioId) ?? null,
    [portfolios, selectedPinnedPortfolioId],
  );
  const selectedFloorPin = useMemo(() => {
    if (!selectedPinnedPortfolioId) return null;
    if (selectedFloorPinId) {
      const exact = floorPlanPins.find((x) => x.portfolioId === selectedPinnedPortfolioId && x.pinId === selectedFloorPinId);
      if (exact) return exact;
    }
    return floorPlanPins.find((x) => x.portfolioId === selectedPinnedPortfolioId) ?? null;
  }, [floorPlanPins, selectedPinnedPortfolioId, selectedFloorPinId]);

  const galleryBeforeImages = useMemo(
    () => (selectedFloorPin ? selectedFloorPin.beforeImageUrls : []),
    [selectedFloorPin],
  );
  const galleryAfterImages = useMemo(
    () => (selectedFloorPin ? selectedFloorPin.afterImageUrls : []),
    [selectedFloorPin],
  );

  useEffect(() => {
    if (!actionNotice) return;
    const timer = window.setTimeout(() => setActionNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  function firstPinIdForPortfolio(portfolioId: number): string {
    const first = floorPlanPins.find((x) => x.portfolioId === portfolioId);
    return first?.pinId ?? `${portfolioId}-pin-1`;
  }

  function onFloorPinSelect(pin: FloorPin) {
    const portfolioId = pin.portfolioId;
    const defaultSide = selectedCardImages[portfolioId] ?? "after";
    setSelectedCardImages((prev) => ({ ...prev, [portfolioId]: defaultSide }));
    setSelectedPinnedPortfolioId(portfolioId);
    setSelectedFloorPinId(pin.pinId);
    setGallerySide(defaultSide);
    setHighlightList(true);
    window.requestAnimationFrame(() => {
      const container = cardsRef.current;
      if (!container) return;
      const el = container.querySelector<HTMLElement>(`[data-portfolio-id="${portfolioId}"]`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  async function handleSelectComplex(complexId: number, fromMap = false) {
    setStatus("단지 정보를 불러오는 중입니다.");
    try {
      const detail = await fetchComplexDetail(complexId);
      setSelectedComplex(detail);
      const first = detail.unit_types[0] ?? null;
      setSelectedUnitType(first);
      if (fromMap) {
        setHighlightList(true);
      }
      if (!first) {
        setPortfolios([]);
        setStatus("이 단지는 타입 정보가 없습니다.");
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "단지 상세를 불러오지 못했습니다.");
    }
  }

  function toggleWorkScopeFilter(scope: WorkScopeType) {
    setFilters((prev) => ({ ...prev, work_scope: prev.work_scope === scope ? undefined : scope }));
  }

  function toggleMinAreaFilter(area: number) {
    setFilters((prev) => ({ ...prev, min_area: prev.min_area === area ? undefined : area }));
  }

  function clearFilter(key: keyof PortfolioFilters) {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function filterByVendor(card: PortfolioCard) {
    if (!card.vendor_id) {
      setStatus("이 사례는 업체 정보가 없어 업체별 필터를 적용할 수 없습니다.");
      return;
    }
    setFilters((prev) => ({ ...prev, vendor_id: card.vendor_id ?? undefined }));
    setStatus(`${card.vendor_name ?? `업체 #${card.vendor_id}`} 사례만 표시합니다.`);
  }

  function selectVendorChip(vendorId?: number) {
    setFilters((prev) => ({ ...prev, vendor_id: vendorId }));
    if (vendorId == null) {
      if (autoFavoriteVendorFilter && favoriteVendorIds.length > 0) {
        setStatus(`즐겨찾기 업체 자동 적용: 업체 #${favoriteVendorIds[0]}`);
      } else {
        setStatus("전체 업체 사례를 표시합니다.");
      }
      return;
    }
    const vendor = vendorChips.find((x) => x.vendorId === vendorId);
    setStatus(`${vendor?.name ?? `업체 #${vendorId}`} 사례만 표시합니다.`);
  }

  function toggleFavoriteVendor(vendorId: number) {
    setFavoriteVendorIds((prev) =>
      prev.includes(vendorId) ? prev.filter((x) => x !== vendorId) : [...prev, vendorId],
    );
  }

  useEffect(() => {
    if (mapMode !== "nearby" || !userLocation) return;
    let cancelled = false;
    const run = async () => {
      setLoadingMap(true);
      try {
        const data = await fetchNearbyComplexes(userLocation.latitude, userLocation.longitude, nearbyRadiusM, {
          vendor_id: effectiveVendorId,
          work_scope: filters.work_scope,
          min_area: filters.min_area,
        });
        if (cancelled) return;
        setClusters([]);
        setComplexes(data.items);
        const vendorLabel = effectiveVendorId ? ` · 업체 #${effectiveVendorId}` : "";
        setStatus(`내 위치 기준 ${Math.round(nearbyRadiusM / 1000)}km 내 ${data.items.length}개 단지${vendorLabel}`);
      } catch (e) {
        if (cancelled) return;
        setStatus(e instanceof Error ? e.message : "근처 단지를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoadingMap(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [mapMode, userLocation, nearbyRadiusM, effectiveVendorId, filters.work_scope, filters.min_area]);

  function clearQuickFilters() {
    setFilters((prev) => ({ ...prev, work_scope: undefined, min_area: undefined }));
  }

  async function focusNearby() {
    if (!navigator.geolocation) {
      setStatus("이 브라우저는 위치 정보를 지원하지 않습니다.");
      return;
    }

    setStatus("현재 위치를 확인하는 중입니다.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void (async () => {
          const latitude = pos.coords.latitude;
          const longitude = pos.coords.longitude;

          setUserLocation({ latitude, longitude });
          if (mapRef.current) {
            mapRef.current.setView([latitude, longitude], Math.max(14, mapRef.current.getZoom()));
          }

          setMapMode("nearby");
          setStatus("근처 단지를 조회하는 중입니다.");
        })();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("위치 권한이 거부되었습니다. 브라우저에서 위치 권한을 허용해 주세요.");
          return;
        }
        setStatus("위치 정보를 가져오지 못했습니다.");
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 0 },
    );
  }

  function backToBoundsMode() {
    setMapMode("bounds");
    setUserLocation(null);
    syncBoundsFromMap();
    setStatus("일반 지도 탐색 모드로 전환했습니다.");
  }

  async function onFavorite(portfolioId: number) {
    if (!currentUser) {
      setActionNotice({ tone: "error", message: "로그인이 필요합니다." });
      return;
    }

    try {
      await saveFavorite(currentUser.user_key, portfolioId);
      setSavedPortfolioIds((prev) => (prev.includes(portfolioId) ? prev : [...prev, portfolioId]));
      setActionNotice({ tone: "ok", message: "즐겨찾기에 저장했습니다." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "즐겨찾기 저장 실패";
      if (msg.includes("already exists")) {
        setSavedPortfolioIds((prev) => (prev.includes(portfolioId) ? prev : [...prev, portfolioId]));
        setActionNotice({ tone: "ok", message: "이미 즐겨찾기에 저장된 항목입니다." });
        return;
      }
      setActionNotice({ tone: "error", message: msg });
    }
  }

  function openQuoteModal(card: PortfolioCard) {
    setQuoteModalCard(card);
    setQuoteMessage(`${card.title} 관련 상담 요청`);
  }

  function closeQuoteModal() {
    if (quoteSubmitting) return;
    setQuoteModalCard(null);
    setQuoteMessage("");
  }

  async function submitQuote() {
    const card = quoteModalCard;
    if (!card) return;
    if (!currentUser) {
      setActionNotice({ tone: "error", message: "로그인이 필요합니다." });
      return;
    }

    try {
      setQuoteSubmitting(true);
      const result = await requestQuote({
        authToken,
        userKey: currentUser.user_key,
        requesterName: currentUser.display_name,
        requesterEmail: currentUser.email,
        vendorId: card.vendor_id ?? undefined,
        portfolioId: card.portfolio_id,
        message: quoteMessage.trim() || `${card.title} 관련 상담 요청`,
      });
      setQuotedPortfolioIds((prev) => (prev.includes(card.portfolio_id) ? prev : [...prev, card.portfolio_id]));
      setActionNotice({ tone: "ok", message: `문의 접수 완료 (${formatDateTimeLabel(result.created_at)})` });
      setQuoteModalCard(null);
      setQuoteMessage("");
    } catch (e) {
      setActionNotice({ tone: "error", message: e instanceof Error ? e.message : "문의 접수에 실패했습니다." });
    } finally {
      setQuoteSubmitting(false);
    }
  }

  async function submitAuth() {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const result = authMode === "login"
        ? await login({ email: authEmail.trim(), password: authPassword })
        : await signup({ email: authEmail.trim(), password: authPassword, displayName: authDisplayName.trim() });
      setAuthToken(result.access_token);
      setCurrentUser(result.user);
      window.localStorage.setItem(AUTH_TOKEN_KEY, result.access_token);
      setAuthPassword("");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "인증에 실패했습니다.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function onLogout() {
    if (authToken) {
      try {
        await logout(authToken);
      } catch {
        // ignore logout errors
      }
    }
    setAuthToken("");
    setCurrentUser(null);
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }

  function resetMapView() {
    if (!mapRef.current) return;
    mapRef.current.setView(DEFAULT_CENTER, DEFAULT_BOUNDS.zoom);
    setMapMode("bounds");
    setUserLocation(null);
  }

  if (!currentUser) {
    return (
      <div className="auth-page">
        <section className="auth-card">
          <h1>PlaniFit</h1>
          <p>로그인 후 저장/문의 기능을 사용할 수 있습니다.</p>
          <div className="auth-tabs">
            <button className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>로그인</button>
            <button className={authMode === "signup" ? "active" : ""} onClick={() => setAuthMode("signup")}>회원가입</button>
          </div>
          <label>
            이메일
            <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          {authMode === "signup" ? (
            <label>
              이름
              <input value={authDisplayName} onChange={(e) => setAuthDisplayName(e.target.value)} placeholder="홍길동" />
            </label>
          ) : null}
          <label>
            비밀번호
            <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="8자 이상" />
          </label>
          {authError ? <p className="auth-error">{authError}</p> : null}
          <button className="auth-submit" onClick={() => void submitAuth()} disabled={authLoading}>
            {authLoading ? "처리 중..." : authMode === "login" ? "로그인" : "회원가입"}
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="title-wrap">
          <h1>PlaniFit</h1>
          <p>지도에서 평형 타입별 인테리어 사례를 한 번에 탐색</p>
        </div>
        <div className="top-actions">
          <div className="user-badge">
            <strong>{currentUser.display_name}</strong>
            <span>{currentUser.email}</span>
          </div>
          <button className="logout-btn" onClick={() => void onLogout()}>로그아웃</button>
        </div>
      </header>

      <section className="preset-row">
        <button className={filters.work_scope === "partial" ? "active-chip" : ""} onClick={() => toggleWorkScopeFilter("partial")}>
          부분공사
        </button>
        <button className={filters.work_scope === "full_remodeling" ? "active-chip" : ""} onClick={() => toggleWorkScopeFilter("full_remodeling")}>
          전체 리모델링
        </button>
        <button className={filters.work_scope === "kitchen" ? "active-chip" : ""} onClick={() => toggleWorkScopeFilter("kitchen")}>
          주방
        </button>
        <button className={filters.work_scope === "bathroom" ? "active-chip" : ""} onClick={() => toggleWorkScopeFilter("bathroom")}>
          욕실
        </button>
        <button className={filters.min_area === 59 ? "active-chip" : ""} onClick={() => toggleMinAreaFilter(59)}>
          59m2+
        </button>
        <button className={filters.min_area === 84 ? "active-chip" : ""} onClick={() => toggleMinAreaFilter(84)}>
          84m2+
        </button>
        {(filters.work_scope || filters.min_area !== undefined) ? (
          <button onClick={clearQuickFilters}>빠른필터 초기화</button>
        ) : null}
        {activeFilterChips.map((chip) => (
          <button key={chip.key} className="active-chip" onClick={() => clearFilter(chip.key)}>
            {chip.label} ×
          </button>
        ))}
      </section>
      {actionNotice ? (
        <p className={actionNotice.tone === "ok" ? "action-notice ok" : "action-notice error"}>
          {actionNotice.message}
        </p>
      ) : null}

      <main className="content">
        <section className="map-panel">
          <div className="map-toolbar">
            <button onClick={resetMapView}>초기화</button>
            <button onClick={() => void focusNearby()}>내 위치 주변</button>
            <select value={nearbyRadiusM} onChange={(e) => setNearbyRadiusM(Number(e.target.value))}>
              <option value={1000}>1km</option>
              <option value={3000}>3km</option>
              <option value={5000}>5km</option>
            </select>
            {mapMode === "nearby" ? <button onClick={backToBoundsMode}>일반 탐색</button> : null}
            {loadingMap ? <span>지도 로딩 중...</span> : null}
          </div>
          <div className="map-canvas" ref={mapContainerRef} />
        </section>

        <section className="sheet">
          <div className="sheet-head">
            <h2>{selectedComplex?.name ?? "단지를 선택하세요"}</h2>
            <p>{selectedComplex?.address ?? "지도에서 단지 핀을 클릭하면 상세가 열립니다."}</p>
            {selectedDistance != null ? <p className="distance-pill">현재 위치에서 약 {Math.round(selectedDistance)}m</p> : null}
          </div>

          <div className="type-chips">
            {unitTypeButtons.map((unit) => {
              const active = selectedUnitType?.unit_type_id === unit.unit_type_id;
              return (
                <button
                  key={unit.unit_type_id}
                  className={active ? "chip active" : "chip"}
                  onClick={() => setSelectedUnitType(unit)}
                >
                  {Math.round(unit.exclusive_area_m2)}
                  {unit.type_code ? unit.type_code : ""}
                  <em>{unit.portfolio_count}</em>
                </button>
              );
            })}
          </div>
          <div className="vendor-chips">
            <button
              className={autoFavoriteVendorFilter ? "chip active" : "chip"}
              onClick={() => setAutoFavoriteVendorFilter((prev) => !prev)}
              title="업체를 직접 고르지 않았을 때 즐겨찾기 업체를 자동으로 적용합니다."
            >
              즐겨찾기 업체 자동 적용
            </button>
            <input
              className="vendor-search"
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              placeholder="업체명 검색"
            />
            <button
              className={filters.vendor_id === undefined ? "chip active" : "chip"}
              onClick={() => selectVendorChip(undefined)}
            >
              전체 업체
            </button>
            {vendorChips.map((vendor) => (
              <div key={vendor.vendorId} className="vendor-chip-item">
                <button
                  className={filters.vendor_id === vendor.vendorId ? "chip active" : "chip"}
                  onClick={() => selectVendorChip(vendor.vendorId)}
                >
                  {vendor.name}
                  <em>{vendor.count}</em>
                </button>
                <button
                  className={vendor.favorite ? "vendor-fav active" : "vendor-fav"}
                  onClick={() => toggleFavoriteVendor(vendor.vendorId)}
                  title={vendor.favorite ? "즐겨찾기 해제" : "즐겨찾기"}
                >
                  {vendor.favorite ? "★" : "☆"}
                </button>
              </div>
            ))}
          </div>
          <p className="vendor-help">
            직접 업체를 고르지 않으면 즐겨찾기 업체가 자동 적용됩니다.
          </p>
          {selectedUnitType ? (
            <section className="floor-plan-panel">
              <div className="floor-plan-head">
                <h3>평면도</h3>
                <p>
                  {Math.round(selectedUnitType.exclusive_area_m2)}
                  {selectedUnitType.type_code ?? ""}
                  {selectedUnitType.structure_keyword ? ` · ${selectedUnitType.structure_keyword}` : ""}
                </p>
              </div>
              <div className="floor-plan-image-wrap">
                <img
                  src={selectedFloorPlanImage}
                  alt="선택 평형 평면도"
                  loading="lazy"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.src === SAMPLE_FLOOR_PLAN_URL) return;
                    img.src = SAMPLE_FLOOR_PLAN_URL;
                  }}
                />
                <div className="floor-plan-pin-layer">
                  {floorPlanPins.map((pin) => {
                    const active = selectedPinnedPortfolioId === pin.portfolioId && selectedFloorPinId === pin.pinId;
                    return (
                      <button
                        key={`${pin.pinId}`}
                        type="button"
                        className={active ? "floor-plan-pin active" : "floor-plan-pin"}
                        style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                        onClick={() => onFloorPinSelect(pin)}
                        title={`${pin.title ?? "핀"} · #${pin.portfolioId}`}
                      >
                        ●
                      </button>
                    );
                  })}
                </div>
              </div>
              {selectedPinnedCard ? (
                <div className="pin-gallery">
                  <div className="pin-gallery-head">
                    <strong>{selectedPinnedCard.title}</strong>
                    <span>
                      {selectedFloorPin?.title ?? "핀"} · #{selectedPinnedCard.portfolio_id}
                    </span>
                  </div>
                  <div className="pin-gallery-tabs">
                    <button className={gallerySide === "before" ? "active" : ""} onClick={() => setGallerySide("before")}>
                      Before {galleryBeforeImages.length}
                    </button>
                    <button className={gallerySide === "after" ? "active" : ""} onClick={() => setGallerySide("after")}>
                      After {galleryAfterImages.length}
                    </button>
                  </div>
                  <div className="pin-gallery-grid">
                    {(gallerySide === "before" ? galleryBeforeImages : galleryAfterImages).map((url, idx) => (
                      <img key={`${gallerySide}-${idx}`} src={url} alt={`${gallerySide}-${idx + 1}`} loading="lazy" />
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {loadingPortfolios ? <p className="state">포트폴리오 로딩 중...</p> : null}

          <div ref={cardsRef} className={highlightList ? "cards cards-highlight" : "cards"}>
            {portfolios.map((card) => (
              <article
                key={card.portfolio_id}
                data-portfolio-id={card.portfolio_id}
                className={selectedPinnedPortfolioId === card.portfolio_id ? "portfolio-card active" : "portfolio-card"}
              >
                <div className="thumbs">
                  <button
                    type="button"
                    className={selectedCardImages[card.portfolio_id] === "before" ? "thumb selected" : "thumb"}
                    onClick={() => {
                      setSelectedCardImages((prev) => ({ ...prev, [card.portfolio_id]: "before" }));
                      setSelectedPinnedPortfolioId(card.portfolio_id);
                      setSelectedFloorPinId(firstPinIdForPortfolio(card.portfolio_id));
                      setGallerySide("before");
                    }}
                  >
                    <img
                      src={imageList(card, "before")[0]}
                      alt={`${card.title} before`}
                      loading="lazy"
                      onError={(e) => {
                        const img = e.currentTarget;
                        const fallback = sampleBeforeUrl(card.portfolio_id);
                        if (img.src === fallback) return;
                        img.src = fallback;
                      }}
                    />
                    <strong>Before</strong>
                    {selectedCardImages[card.portfolio_id] === "before" ? <i className="thumb-pin">PIN</i> : null}
                  </button>
                  <button
                    type="button"
                    className={selectedCardImages[card.portfolio_id] === "after" ? "thumb selected" : "thumb"}
                    onClick={() => {
                      setSelectedCardImages((prev) => ({ ...prev, [card.portfolio_id]: "after" }));
                      setSelectedPinnedPortfolioId(card.portfolio_id);
                      setSelectedFloorPinId(firstPinIdForPortfolio(card.portfolio_id));
                      setGallerySide("after");
                    }}
                  >
                    <img
                      src={imageList(card, "after")[0]}
                      alt={`${card.title} after`}
                      loading="lazy"
                      onError={(e) => {
                        const img = e.currentTarget;
                        const fallback = sampleAfterUrl(card.portfolio_id);
                        if (img.src === fallback) return;
                        img.src = fallback;
                      }}
                    />
                    <strong>After</strong>
                    {selectedCardImages[card.portfolio_id] === "after" ? <i className="thumb-pin">PIN</i> : null}
                  </button>
                </div>
                <h3>{card.title}</h3>
                <p className="card-summary">{cardSummary(card)}</p>
                <div className="meta compact">
                  <span>{card.style}</span>
                  <span>{card.work_scope}</span>
                </div>
                <div className="actions">
                  <button className="ghost" onClick={() => filterByVendor(card)} disabled={!card.vendor_id}>
                    같은 업체만
                  </button>
                  <button className="ghost" onClick={() => onFavorite(card.portfolio_id)}>
                    {savedPortfolioIds.includes(card.portfolio_id) ? "저장됨" : "저장"}
                  </button>
                  <button className="solid" onClick={() => openQuoteModal(card)} disabled={quotedPortfolioIds.includes(card.portfolio_id)}>
                    {quotedPortfolioIds.includes(card.portfolio_id) ? "문의완료" : "문의"}
                  </button>
                </div>
              </article>
            ))}
            {!loadingPortfolios && portfolios.length === 0 ? <p className="state">선택한 조건의 사례가 없습니다.</p> : null}
          </div>
        </section>
      </main>
      {quoteModalCard ? (
        <div className="quote-modal-backdrop" onClick={closeQuoteModal}>
          <section className="quote-modal" onClick={(e) => e.stopPropagation()}>
            <h3>문의 보내기</h3>
            <p>{quoteModalCard.title}</p>
            <textarea
              value={quoteMessage}
              onChange={(e) => setQuoteMessage(e.target.value)}
              placeholder="문의 내용을 입력하세요."
              rows={5}
            />
            <div className="quote-modal-actions">
              <button className="ghost" onClick={closeQuoteModal} disabled={quoteSubmitting}>취소</button>
              <button className="solid" onClick={() => void submitQuote()} disabled={quoteSubmitting}>
                {quoteSubmitting ? "전송 중..." : "문의 전송"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
