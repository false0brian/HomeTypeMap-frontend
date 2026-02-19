import { FormEvent, useEffect, useState } from "react";

import {
  adminCreateBlogPost,
  adminCreatePortfolio,
  adminListBlogPosts,
  adminListPortfolios,
  adminUpdateBlogStatus,
  adminUpdatePortfolioStatus,
} from "./api";
import type { AdminBlogPost, AdminPortfolio, PublishStatus } from "./types";

const DEFAULT_ADMIN_KEY = import.meta.env.VITE_ADMIN_API_KEY ?? "";

export default function AdminApp() {
  const [adminKey, setAdminKey] = useState(DEFAULT_ADMIN_KEY);
  const [status, setStatus] = useState("관리자 콘솔 준비 중");
  const [portfolios, setPortfolios] = useState<AdminPortfolio[]>([]);
  const [posts, setPosts] = useState<AdminBlogPost[]>([]);
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
