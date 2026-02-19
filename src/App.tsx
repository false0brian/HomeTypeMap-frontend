import { useEffect, useMemo, useRef, useState } from "react";
import * as L from "leaflet";

import {
  fetchComplexDetail,
  fetchMapPins,
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

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const syncBounds = () => {
      const b = map.getBounds();
      setBounds({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
        zoom: map.getZoom(),
      });
    };

    map.on("moveend", syncBounds);
    map.on("zoomend", syncBounds);
    syncBounds();

    setStatus("지도 준비 완료. 핀을 선택하세요.");

    return () => {
      map.off("moveend", syncBounds);
      map.off("zoomend", syncBounds);
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
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
  }, [bounds]);

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
      const marker = L.marker([pin.latitude, pin.longitude], {
        icon: markerIcon(active ? "complex-dot active" : "complex-dot", String(pin.portfolio_count)),
      });
      marker.on("click", () => {
        map.panTo([pin.latitude, pin.longitude]);
        void handleSelectComplex(pin.complex_id);
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
  }, [selectedComplex, selectedUnitType, filters]);

  const unitTypeButtons = useMemo(() => selectedComplex?.unit_types ?? [], [selectedComplex]);

  async function handleSelectComplex(complexId: number) {
    setStatus("단지 정보를 불러오는 중입니다.");
    try {
      const detail = await fetchComplexDetail(complexId);
      setSelectedComplex(detail);
      const first = detail.unit_types[0] ?? null;
      setSelectedUnitType(first);
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

  function resetFilters() {
    setWorkScopeDraft("");
    setMinAreaDraft("");
    setBudgetMaxDraft("");
    setFilters(DEFAULT_FILTERS);
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

      <p className="status-bar">{status}</p>

      <main className="content">
        <section className="map-panel">
          <div className="map-toolbar">
            <button onClick={resetMapView}>초기화</button>
            {loadingMap ? <span>지도 로딩 중...</span> : <span>클러스터 {clusters.length} / 핀 {complexes.length}</span>}
          </div>
          <div className="map-canvas" ref={mapContainerRef} />
        </section>

        <section className="sheet">
          <div className="sheet-head">
            <h2>{selectedComplex?.name ?? "단지를 선택하세요"}</h2>
            <p>{selectedComplex?.address ?? "지도에서 단지 핀을 클릭하면 상세가 열립니다."}</p>
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

          {loadingPortfolios ? <p className="state">포트폴리오 로딩 중...</p> : null}

          <div className="cards">
            {portfolios.map((card) => (
              <article key={card.portfolio_id} className="portfolio-card">
                <div className="thumbs">
                  <div>{card.before_image_url ? "Before" : "이미지 없음"}</div>
                  <div>{card.after_image_url ? "After" : "이미지 없음"}</div>
                </div>
                <h3>{card.title}</h3>
                <div className="meta">
                  <span>{card.style}</span>
                  <span>{card.work_scope}</span>
                  <span>{priceLabel(card.budget_min_krw, card.budget_max_krw)}</span>
                  <span>{card.duration_days ? `${card.duration_days}일` : "기간 미정"}</span>
                  <span>{card.vendor_name ?? "업체 미지정"}</span>
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
