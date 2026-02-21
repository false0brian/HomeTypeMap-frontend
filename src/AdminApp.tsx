import { FormEvent, useEffect, useRef, useState } from "react";

import {
  adminCreateFloorPlanPin,
  adminCreateBlogPost,
  adminCreatePortfolio,
  adminDeleteFloorPlanPin,
  adminListFloorPlanPins,
  adminListBlogPosts,
  adminListPortfolios,
  adminUpdateFloorPlanPin,
  adminUpdateBlogStatus,
  adminUpdatePortfolioStatus,
} from "./api";
import type { AdminBlogPost, AdminFloorPlanPin, AdminPortfolio, PublishStatus } from "./types";

const DEFAULT_ADMIN_KEY = import.meta.env.VITE_ADMIN_API_KEY ?? "";

export default function AdminApp() {
  const floorPlanEditorRef = useRef<HTMLDivElement | null>(null);
  const [adminKey, setAdminKey] = useState(DEFAULT_ADMIN_KEY);
  const [status, setStatus] = useState("관리자 콘솔 준비 중");
  const [portfolios, setPortfolios] = useState<AdminPortfolio[]>([]);
  const [posts, setPosts] = useState<AdminBlogPost[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [pins, setPins] = useState<AdminFloorPlanPin[]>([]);
  const [editingPinId, setEditingPinId] = useState<number | null>(null);
  const [draggingPinId, setDraggingPinId] = useState<number | null>(null);
  const [pinForm, setPinForm] = useState({
    x_ratio: "50",
    y_ratio: "50",
    title: "",
    sort_order: "1",
    before_urls: "",
    after_urls: "",
  });
  const [portfolioForm, setPortfolioForm] = useState({
    complex_id: "101",
    unit_type_id: "1001",
    vendor_id: "501",
    title: "",
    work_scope: "partial",
    style: "minimal",
    status: "draft" as PublishStatus,
  });
  const [blogForm, setBlogForm] = useState({
    vendor_id: "501",
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    status: "draft" as PublishStatus,
  });

  async function refreshAll() {
    if (!adminKey.trim()) {
      setStatus("X-Admin-Key를 입력하세요.");
      return;
    }
    try {
      const [nextPortfolios, nextPosts] = await Promise.all([
        adminListPortfolios(adminKey.trim()),
        adminListBlogPosts(adminKey.trim()),
      ]);
      setPortfolios(nextPortfolios);
      setPosts(nextPosts);
      if (nextPortfolios.length > 0 && !selectedPortfolioId) {
        setSelectedPortfolioId(nextPortfolios[0].portfolio_id);
      }
      setStatus(`불러오기 완료: 포트폴리오 ${nextPortfolios.length}개, 블로그 ${nextPosts.length}개`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "관리자 데이터를 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    if (!adminKey.trim()) return;
    void refreshAll();
  }, []);

  async function onCreatePortfolio(e: FormEvent) {
    e.preventDefault();
    try {
      await adminCreatePortfolio(adminKey.trim(), {
        complex_id: Number(portfolioForm.complex_id),
        unit_type_id: Number(portfolioForm.unit_type_id),
        vendor_id: Number(portfolioForm.vendor_id),
        title: portfolioForm.title,
        work_scope: portfolioForm.work_scope,
        style: portfolioForm.style,
        status: portfolioForm.status,
      });
      setPortfolioForm((prev) => ({ ...prev, title: "" }));
      await refreshAll();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "포트폴리오 등록 실패");
    }
  }

  async function onCreateBlogPost(e: FormEvent) {
    e.preventDefault();
    try {
      await adminCreateBlogPost(adminKey.trim(), {
        vendor_id: Number(blogForm.vendor_id),
        title: blogForm.title,
        slug: blogForm.slug,
        excerpt: blogForm.excerpt,
        content: blogForm.content,
        status: blogForm.status,
      });
      setBlogForm((prev) => ({ ...prev, title: "", slug: "", excerpt: "", content: "" }));
      await refreshAll();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "블로그 등록 실패");
    }
  }

  async function refreshPins(portfolioId: number) {
    try {
      const rows = await adminListFloorPlanPins(adminKey.trim(), portfolioId);
      setPins(rows);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "핀 목록 불러오기 실패");
    }
  }

  async function publishPortfolio(portfolioId: number) {
    try {
      await adminUpdatePortfolioStatus(adminKey.trim(), portfolioId, "published");
      await refreshAll();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "포트폴리오 상태 변경 실패");
    }
  }

  async function publishBlogPost(postId: number) {
    try {
      await adminUpdateBlogStatus(adminKey.trim(), postId, "published");
      await refreshAll();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "블로그 상태 변경 실패");
    }
  }

  useEffect(() => {
    if (!selectedPortfolioId || !adminKey.trim()) return;
    void refreshPins(selectedPortfolioId);
  }, [selectedPortfolioId, adminKey]);

  async function savePin(e: FormEvent) {
    e.preventDefault();
    if (!selectedPortfolioId) return;
    const payload = {
      x_ratio: Number(pinForm.x_ratio),
      y_ratio: Number(pinForm.y_ratio),
      title: pinForm.title || undefined,
      sort_order: Number(pinForm.sort_order || "0"),
      before_image_urls: pinForm.before_urls.split("\n").map((x) => x.trim()).filter(Boolean),
      after_image_urls: pinForm.after_urls.split("\n").map((x) => x.trim()).filter(Boolean),
    };
    try {
      if (editingPinId) {
        await adminUpdateFloorPlanPin(adminKey.trim(), editingPinId, payload);
      } else {
        await adminCreateFloorPlanPin(adminKey.trim(), selectedPortfolioId, payload);
      }
      setEditingPinId(null);
      setPinForm({ x_ratio: "50", y_ratio: "50", title: "", sort_order: "1", before_urls: "", after_urls: "" });
      await refreshPins(selectedPortfolioId);
      setStatus("핀 저장 완료");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "핀 저장 실패");
    }
  }

  function editPin(pin: AdminFloorPlanPin) {
    setEditingPinId(pin.pin_id);
    setPinForm({
      x_ratio: String(pin.x_ratio),
      y_ratio: String(pin.y_ratio),
      title: pin.title ?? "",
      sort_order: String(pin.sort_order),
      before_urls: pin.before_image_urls.join("\n"),
      after_urls: pin.after_image_urls.join("\n"),
    });
  }

  async function removePin(pinId: number) {
    if (!selectedPortfolioId) return;
    try {
      await adminDeleteFloorPlanPin(adminKey.trim(), pinId);
      if (editingPinId === pinId) {
        setEditingPinId(null);
      }
      await refreshPins(selectedPortfolioId);
      setStatus("핀 삭제 완료");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "핀 삭제 실패");
    }
  }

  function ratioFromClient(clientX: number, clientY: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  }

  function onFloorPlanClick(clientX: number, clientY: number, el: HTMLElement) {
    if (draggingPinId) return;
    const { x, y } = ratioFromClient(clientX, clientY, el);
    setPinForm((prev) => ({ ...prev, x_ratio: x.toFixed(2), y_ratio: y.toFixed(2) }));
  }

  function onDragStart(pin: AdminFloorPlanPin) {
    setDraggingPinId(pin.pin_id);
    editPin(pin);
  }

  function onEditorMouseMove(clientX: number, clientY: number) {
    if (!draggingPinId || !floorPlanEditorRef.current) return;
    const { x, y } = ratioFromClient(clientX, clientY, floorPlanEditorRef.current);
    setPinForm((prev) => ({ ...prev, x_ratio: x.toFixed(2), y_ratio: y.toFixed(2) }));
    setPins((prev) =>
      prev.map((pin) => (pin.pin_id === draggingPinId ? { ...pin, x_ratio: x, y_ratio: y } : pin)),
    );
  }

  async function onDragEnd() {
    if (!draggingPinId || !selectedPortfolioId) return;
    const pin = pins.find((x) => x.pin_id === draggingPinId);
    setDraggingPinId(null);
    if (!pin) return;
    try {
      await adminUpdateFloorPlanPin(adminKey.trim(), pin.pin_id, {
        x_ratio: pin.x_ratio,
        y_ratio: pin.y_ratio,
      });
      setStatus("핀 위치 저장 완료");
      await refreshPins(selectedPortfolioId);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "핀 위치 저장 실패");
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1>Partner Console</h1>
          <p>업체 관리자용 포트폴리오/블로그 CMS</p>
        </div>
        <div className="admin-key-box">
          <label>X-Admin-Key</label>
          <input value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="dev-admin-key" />
          <button onClick={() => void refreshAll()}>새로고침</button>
        </div>
      </header>

      <p className="admin-status">{status}</p>

      <main className="admin-grid">
        <section className="admin-panel">
          <h2>포트폴리오 등록</h2>
          <form className="admin-form" onSubmit={onCreatePortfolio}>
            <input
              value={portfolioForm.complex_id}
              onChange={(e) => setPortfolioForm((prev) => ({ ...prev, complex_id: e.target.value }))}
              placeholder="complex_id"
            />
            <input
              value={portfolioForm.unit_type_id}
              onChange={(e) => setPortfolioForm((prev) => ({ ...prev, unit_type_id: e.target.value }))}
              placeholder="unit_type_id"
            />
            <input
              value={portfolioForm.vendor_id}
              onChange={(e) => setPortfolioForm((prev) => ({ ...prev, vendor_id: e.target.value }))}
              placeholder="vendor_id"
            />
            <input
              value={portfolioForm.title}
              onChange={(e) => setPortfolioForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="포트폴리오 제목"
              required
            />
            <input
              value={portfolioForm.work_scope}
              onChange={(e) => setPortfolioForm((prev) => ({ ...prev, work_scope: e.target.value }))}
              placeholder="work_scope"
              required
            />
            <input
              value={portfolioForm.style}
              onChange={(e) => setPortfolioForm((prev) => ({ ...prev, style: e.target.value }))}
              placeholder="style"
              required
            />
            <select
              value={portfolioForm.status}
              onChange={(e) => setPortfolioForm((prev) => ({ ...prev, status: e.target.value as PublishStatus }))}
            >
              <option value="draft">draft</option>
              <option value="review">review</option>
              <option value="published">published</option>
            </select>
            <button type="submit">포트폴리오 저장</button>
          </form>

          <div className="admin-list">
            {portfolios.map((item) => (
              <article key={item.portfolio_id} className="admin-card">
                <h3>{item.title}</h3>
                <p>
                  #{item.portfolio_id} / status: <strong>{item.status}</strong>
                </p>
                <button onClick={() => void publishPortfolio(item.portfolio_id)}>발행 처리</button>
              </article>
            ))}
          </div>

          <h2>평면도 핀 편집</h2>
          <div className="admin-form">
            <label>
              대상 포트폴리오
              <select
                value={selectedPortfolioId ?? ""}
                onChange={(e) => setSelectedPortfolioId(Number(e.target.value))}
              >
                {portfolios.map((item) => (
                  <option key={item.portfolio_id} value={item.portfolio_id}>
                    #{item.portfolio_id} {item.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            ref={floorPlanEditorRef}
            className={draggingPinId ? "floor-plan-editor dragging" : "floor-plan-editor"}
            onClick={(e) => {
              if (e.target !== e.currentTarget) return;
              onFloorPlanClick(e.clientX, e.clientY, e.currentTarget);
            }}
            onMouseMove={(e) => onEditorMouseMove(e.clientX, e.clientY)}
            onMouseUp={() => void onDragEnd()}
            onMouseLeave={() => void onDragEnd()}
          >
            {pins.map((pin) => (
              <button
                key={pin.pin_id}
                type="button"
                className={editingPinId === pin.pin_id ? "editor-pin active" : "editor-pin"}
                style={{ left: `${pin.x_ratio}%`, top: `${pin.y_ratio}%` }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onDragStart(pin);
                }}
                title={pin.title ?? `pin-${pin.pin_id}`}
              >
                {pin.sort_order}
              </button>
            ))}
          </div>

          <form className="admin-form" onSubmit={savePin}>
            <input
              value={pinForm.title}
              onChange={(e) => setPinForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="핀 제목"
            />
            <div className="pin-grid">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={pinForm.x_ratio}
                onChange={(e) => setPinForm((prev) => ({ ...prev, x_ratio: e.target.value }))}
                placeholder="x(%)"
                required
              />
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={pinForm.y_ratio}
                onChange={(e) => setPinForm((prev) => ({ ...prev, y_ratio: e.target.value }))}
                placeholder="y(%)"
                required
              />
              <input
                type="number"
                min="0"
                value={pinForm.sort_order}
                onChange={(e) => setPinForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                placeholder="sort_order"
              />
            </div>
            <textarea
              rows={4}
              value={pinForm.before_urls}
              onChange={(e) => setPinForm((prev) => ({ ...prev, before_urls: e.target.value }))}
              placeholder="Before 이미지 URL (줄바꿈으로 여러 개)"
            />
            <textarea
              rows={4}
              value={pinForm.after_urls}
              onChange={(e) => setPinForm((prev) => ({ ...prev, after_urls: e.target.value }))}
              placeholder="After 이미지 URL (줄바꿈으로 여러 개)"
            />
            <button type="submit">{editingPinId ? "핀 수정 저장" : "핀 추가"}</button>
          </form>

          <div className="admin-list">
            {pins.map((pin) => (
              <article key={pin.pin_id} className="admin-card">
                <h3>{pin.title ?? `핀 ${pin.pin_id}`}</h3>
                <p>
                  ({pin.x_ratio.toFixed(2)}%, {pin.y_ratio.toFixed(2)}%) / before {pin.before_image_urls.length} / after{" "}
                  {pin.after_image_urls.length}
                </p>
                <div className="pin-actions">
                  <button onClick={() => editPin(pin)}>편집</button>
                  <button onClick={() => void removePin(pin.pin_id)}>삭제</button>
                </div>
              </article>
            ))}
            {pins.length === 0 ? <p className="state">핀이 없습니다.</p> : null}
          </div>
        </section>

        <section className="admin-panel">
          <h2>블로그 등록</h2>
          <form className="admin-form" onSubmit={onCreateBlogPost}>
            <input
              value={blogForm.vendor_id}
              onChange={(e) => setBlogForm((prev) => ({ ...prev, vendor_id: e.target.value }))}
              placeholder="vendor_id"
            />
            <input
              value={blogForm.title}
              onChange={(e) => setBlogForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="제목"
              required
            />
            <input
              value={blogForm.slug}
              onChange={(e) => setBlogForm((prev) => ({ ...prev, slug: e.target.value }))}
              placeholder="slug"
              required
            />
            <input
              value={blogForm.excerpt}
              onChange={(e) => setBlogForm((prev) => ({ ...prev, excerpt: e.target.value }))}
              placeholder="요약"
            />
            <textarea
              value={blogForm.content}
              onChange={(e) => setBlogForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="본문"
              rows={5}
              required
            />
            <select
              value={blogForm.status}
              onChange={(e) => setBlogForm((prev) => ({ ...prev, status: e.target.value as PublishStatus }))}
            >
              <option value="draft">draft</option>
              <option value="review">review</option>
              <option value="published">published</option>
            </select>
            <button type="submit">블로그 저장</button>
          </form>

          <div className="admin-list">
            {posts.map((post) => (
              <article key={post.post_id} className="admin-card">
                <h3>{post.title}</h3>
                <p>
                  @{post.slug} / status: <strong>{post.status}</strong>
                </p>
                <button onClick={() => void publishBlogPost(post.post_id)}>발행 처리</button>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
