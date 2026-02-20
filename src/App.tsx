import { useEffect, useMemo, useRef, useState } from "react";
import * as L from "leaflet";

import {
  fetchComplexDetail,
  fetchMapPins,
  fetchNearbyComplexes,
  fetchPortfolios,
  requestQuote,
  saveFavorite,
  type BoundsQuery,
} from "./api";
import type {
  ClusterPin,
  ComplexDetailResponse,
  ComplexPin,
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

type MobilePanel = "map" | "list";
type MapMode = "bounds" | "nearby";
type CardImageSide = "before" | "after";
type FloorPin = { portfolioId: number; side: CardImageSide; x: number; y: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parsePositiveNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return num;
}

function priceLabel(min?: number | null, max?: number | null) {
  if (min == null && max == null) return "예산 미정";
  const lo = min == null ? "-" : `${Math.round(min / 10000).toLocaleString()}만원`;
  const hi = max == null ? "-" : `${Math.round(max / 10000).toLocaleString()}만원`;
  return `${lo} ~ ${hi}`;
}

function cardSummary(card: PortfolioCard) {
  const duration = card.duration_days ? `${card.duration_days}일` : "기간 미정";
  const vendor = card.vendor_name ?? "업체 미지정";
  return `예산 ${priceLabel(card.budget_min_krw, card.budget_max_krw)} · ${card.work_scope} · ${duration} · ${vendor}`;
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

function fallbackFloorPin(portfolioId: number, side: CardImageSide): { x: number; y: number } {
  const baseX = 18 + (portfolioId * 17 % 64);
  const baseY = 16 + (portfolioId * 13 % 66);
  if (side === "before") return { x: baseX, y: baseY };
  return { x: Math.min(92, baseX + 6), y: Math.min(92, baseY + 4) };
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
  const [workScopeDraft, setWorkScopeDraft] = useState<WorkScopeType | "">("");
  const [minAreaDraft, setMinAreaDraft] = useState("");
  const [budgetMaxDraft, setBudgetMaxDraft] = useState("");

  const [userKey, setUserKey] = useState("demo-user");

  const [loadingMap, setLoadingMap] = useState(false);
  const [loadingPortfolios, setLoadingPortfolios] = useState(false);
  const [status, setStatus] = useState<string>("지도를 초기화하는 중입니다.");

  const [mapMode, setMapMode] = useState<MapMode>("bounds");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("map");
  const [highlightList, setHighlightList] = useState(false);
  const [nearbyRadiusM, setNearbyRadiusM] = useState(3000);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedCardImages, setSelectedCardImages] = useState<Record<number, CardImageSide>>({});
  const [selectedPinnedPortfolioId, setSelectedPinnedPortfolioId] = useState<number | null>(null);

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
    if (mapMode !== "bounds") return;

    let cancelled = false;

    const loadPins = async () => {
      if (!mapRef.current) return;
      setLoadingMap(true);
      try {
        const data = await fetchMapPins(bounds);
        if (cancelled) return;
        setClusters(data.clusters);
        setComplexes(data.complexes);
        setStatus("지도 데이터 업데이트 완료");
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
  }, [bounds, mapMode]);

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
        const data = await fetchPortfolios(selectedComplex.complex_id, selectedUnitType.unit_type_id, filters);
        if (cancelled) return;
        setPortfolios(data.items);
        setStatus(`조회 완료: ${data.total}건`);
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
  }, [selectedComplex, selectedUnitType, filters, highlightList]);

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
  }, [portfolios, selectedPinnedPortfolioId]);

  useEffect(() => {
    setSelectedPinnedPortfolioId(null);
  }, [selectedUnitType?.unit_type_id]);

  const unitTypeButtons = useMemo(() => selectedComplex?.unit_types ?? [], [selectedComplex]);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: keyof PortfolioFilters; label: string }> = [];
    if (filters.work_scope) chips.push({ key: "work_scope", label: `범위 ${filters.work_scope}` });
    if (filters.min_area !== undefined) chips.push({ key: "min_area", label: `최소평형 ${filters.min_area}` });
    if (filters.budget_max_krw !== undefined) chips.push({ key: "budget_max_krw", label: `예산상한 ${filters.budget_max_krw.toLocaleString()}원` });
    return chips;
  }, [filters]);

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
      const before = fallbackFloorPin(card.portfolio_id, "before");
      const after = fallbackFloorPin(card.portfolio_id, "after");
      pins.push({
        portfolioId: card.portfolio_id,
        side: "before",
        x: card.floor_plan_before_x ?? before.x,
        y: card.floor_plan_before_y ?? before.y,
      });
      pins.push({
        portfolioId: card.portfolio_id,
        side: "after",
        x: card.floor_plan_after_x ?? after.x,
        y: card.floor_plan_after_y ?? after.y,
      });
    });
    return pins;
  }, [portfolios]);

  function onFloorPinSelect(portfolioId: number, side: CardImageSide) {
    setSelectedCardImages((prev) => ({ ...prev, [portfolioId]: side }));
    setSelectedPinnedPortfolioId(portfolioId);
    setMobilePanel("list");
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
        setMobilePanel("list");
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

  function applyFilters() {
    setFilters({
      work_scope: workScopeDraft || undefined,
      min_area: parsePositiveNumber(minAreaDraft),
      budget_max_krw: parsePositiveNumber(budgetMaxDraft),
    });
  }

  function applyPreset(type: "partial" | "budget20" | "area59") {
    if (type === "partial") {
      setWorkScopeDraft("partial");
      setFilters((prev) => ({ ...prev, work_scope: "partial" }));
      return;
    }
    if (type === "budget20") {
      setBudgetMaxDraft("20000000");
      setFilters((prev) => ({ ...prev, budget_max_krw: 20000000 }));
      return;
    }
    setMinAreaDraft("59");
    setFilters((prev) => ({ ...prev, min_area: 59 }));
  }

  function clearFilter(key: keyof PortfolioFilters) {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (key === "work_scope") setWorkScopeDraft("");
    if (key === "min_area") setMinAreaDraft("");
    if (key === "budget_max_krw") setBudgetMaxDraft("");
  }

  function resetFilters() {
    setWorkScopeDraft("");
    setMinAreaDraft("");
    setBudgetMaxDraft("");
    setFilters(DEFAULT_FILTERS);
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

          setLoadingMap(true);
          try {
            const data = await fetchNearbyComplexes(latitude, longitude, nearbyRadiusM);
            setMapMode("nearby");
            setClusters([]);
            setComplexes(data.items);
            setStatus(`내 위치 기준 ${Math.round(nearbyRadiusM / 1000)}km 내 ${data.items.length}개 단지`);
          } catch (e) {
            setStatus(e instanceof Error ? e.message : "근처 단지를 불러오지 못했습니다.");
          } finally {
            setLoadingMap(false);
          }
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
    if (!userKey.trim()) {
      setStatus("사용자 키를 입력하세요.");
      return;
    }

    try {
      await saveFavorite(userKey.trim(), portfolioId);
      setStatus("즐겨찾기에 저장했습니다.");
    } catch {
      setStatus("즐겨찾기 저장에 실패했습니다.");
    }
  }

  async function onQuote(card: PortfolioCard) {
    if (!userKey.trim()) {
      setStatus("사용자 키를 입력하세요.");
      return;
    }

    try {
      await requestQuote({
        userKey: userKey.trim(),
        vendorId: card.vendor_id ?? undefined,
        portfolioId: card.portfolio_id,
        message: `${card.title} 관련 상담 요청`,
      });
      setStatus("문의가 접수되었습니다.");
    } catch {
      setStatus("문의 접수에 실패했습니다.");
    }
  }

  function zoomIn() {
    if (!mapRef.current) return;
    mapRef.current.setZoom(clamp(mapRef.current.getZoom() + 1, 7, 18));
  }

  function zoomOut() {
    if (!mapRef.current) return;
    mapRef.current.setZoom(clamp(mapRef.current.getZoom() - 1, 7, 18));
  }

  function resetMapView() {
    if (!mapRef.current) return;
    mapRef.current.setView(DEFAULT_CENTER, DEFAULT_BOUNDS.zoom);
    setMapMode("bounds");
    setUserLocation(null);
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="title-wrap">
          <h1>HomeTypeMap</h1>
          <p>지도에서 평형 타입별 인테리어 사례를 한 번에 탐색</p>
        </div>
        <div className="top-actions">
          <label className="user-key">
            user_key
            <input value={userKey} onChange={(e) => setUserKey(e.target.value)} placeholder="demo-user" />
          </label>
          <div className="zoom-controls">
            <button onClick={zoomOut}>-</button>
            <span>Z{bounds.zoom}</span>
            <button onClick={zoomIn}>+</button>
          </div>
        </div>
      </header>

      <section className="filter-row">
        <label>
          공사범위
          <select value={workScopeDraft} onChange={(e) => setWorkScopeDraft((e.target.value as WorkScopeType) || "")}>
            <option value="">전체</option>
            <option value="full_remodeling">전체 리모델링</option>
            <option value="partial">부분 공사</option>
            <option value="kitchen">주방</option>
            <option value="bathroom">욕실</option>
          </select>
        </label>
        <label>
          최소 평형(m2)
          <input type="number" placeholder="59" value={minAreaDraft} onChange={(e) => setMinAreaDraft(e.target.value)} />
        </label>
        <label>
          예산 상한(원)
          <input
            type="number"
            placeholder="50000000"
            value={budgetMaxDraft}
            onChange={(e) => setBudgetMaxDraft(e.target.value)}
          />
        </label>
        <div className="filter-buttons">
          <button className="apply" onClick={applyFilters}>필터 적용</button>
          <button className="reset" onClick={resetFilters}>필터 초기화</button>
        </div>
      </section>

      <section className="preset-row">
        <button onClick={() => applyPreset("partial")}>부분공사</button>
        <button onClick={() => applyPreset("budget20")}>2천만 이하</button>
        <button onClick={() => applyPreset("area59")}>59m2 이상</button>
        {activeFilterChips.map((chip) => (
          <button key={chip.key} className="active-chip" onClick={() => clearFilter(chip.key)}>
            {chip.label} ×
          </button>
        ))}
      </section>

      <p className="status-bar">{status}</p>

      <section className="mobile-panel-tabs">
        <button className={mobilePanel === "map" ? "tab active" : "tab"} onClick={() => setMobilePanel("map")}>지도</button>
        <button className={mobilePanel === "list" ? "tab active" : "tab"} onClick={() => setMobilePanel("list")}>리스트</button>
      </section>

      <main className="content">
        <section className={mobilePanel === "list" ? "map-panel mobile-hidden" : "map-panel"}>
          <div className="map-toolbar">
            <button onClick={resetMapView}>초기화</button>
            <button onClick={() => void focusNearby()}>내 위치 주변</button>
            <select value={nearbyRadiusM} onChange={(e) => setNearbyRadiusM(Number(e.target.value))}>
              <option value={1000}>1km</option>
              <option value={3000}>3km</option>
              <option value={5000}>5km</option>
            </select>
            {mapMode === "nearby" ? <button onClick={backToBoundsMode}>일반 탐색</button> : null}
            {loadingMap ? (
              <span>지도 로딩 중...</span>
            ) : (
              <span>
                {mapMode === "nearby" ? "근처 보기" : "기본 보기"} · 클러스터 {clusters.length} / 핀 {complexes.length}
              </span>
            )}
          </div>
          <div className="map-canvas" ref={mapContainerRef} />
        </section>

        <section className={mobilePanel === "map" ? "sheet mobile-hidden" : "sheet"}>
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
                    const active =
                      selectedPinnedPortfolioId === pin.portfolioId && selectedCardImages[pin.portfolioId] === pin.side;
                    return (
                      <button
                        key={`${pin.portfolioId}-${pin.side}`}
                        type="button"
                        className={active ? "floor-plan-pin active" : "floor-plan-pin"}
                        style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                        onClick={() => onFloorPinSelect(pin.portfolioId, pin.side)}
                        title={`${pin.side === "before" ? "Before" : "After"} · #${pin.portfolioId}`}
                      >
                        {pin.side === "before" ? "B" : "A"}
                      </button>
                    );
                  })}
                </div>
              </div>
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
                    }}
                  >
                    <img
                      src={card.before_image_url || sampleBeforeUrl(card.portfolio_id)}
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
                    }}
                  >
                    <img
                      src={card.after_image_url || sampleAfterUrl(card.portfolio_id)}
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
                  <button className="ghost" onClick={() => onFavorite(card.portfolio_id)}>
                    저장
                  </button>
                  <button className="solid" onClick={() => onQuote(card)}>
                    문의
                  </button>
                </div>
              </article>
            ))}
            {!loadingPortfolios && portfolios.length === 0 ? <p className="state">선택한 조건의 사례가 없습니다.</p> : null}
          </div>
        </section>
      </main>
    </div>
  );
}
