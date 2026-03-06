# Open Music — Roadmap

## ✅ MVP (current)

- Auth: register/login, JWT access + refresh tokens, token rotation
- Search: YouTube (yt-dlp), Internet Archive, Jamendo — parallel aggregation
- Stream proxy: backend-proxied audio, HTTP Range support, CORS bypass
- Player: HTML5 audio, queue, shuffle, repeat, hotkeys, Web Audio visualizer
- Library: liked tracks, albums, listen history
- Playlists: CRUD, add/remove tracks, JSON import/export
- Audio cache: BullMQ job → yt-dlp download → MinIO/S3 storage
- OpenAPI docs at /api/docs
- Docker Compose: postgres, redis, minio

---

## Phase 2 — Content & Discovery

- [ ] **More providers**
  - SoundCloud (public tracks via scdl / API)
  - VK Music (open API)
  - Zaycev.net (HTML scraper with cheerio)
  - FreeMusicArchive (API)
  - Bandcamp (public embeds)
  - MusicBrainz metadata enrichment

- [ ] **Better search**
  - Full-text search with PostgreSQL trigrams (pg_trgm)
  - Filters: genre, year range, duration
  - Artist/album pages aggregated from providers
  - Trending/popular tracks (based on listen count)

- [ ] **Metadata quality**
  - MusicBrainz ISRC matching
  - Last.fm API for artwork, genres, similar artists
  - Automatic BPM detection

---

## Phase 3 — Social & Community

- [ ] **User profiles**
  - Public profiles with avatar, bio, stats
  - Share playlists publicly with unique URL
  - Follow other users, see their public playlists

- [ ] **Social features**
  - Collaborative playlists (multiple editors)
  - Comments on tracks (threaded)
  - Track/playlist sharing via link

- [ ] **Artist profiles**
  - Artist can claim their page (email verification)
  - Upload tracks directly (S3 storage)
  - Artist bio, social links, discography view

---

## Phase 4 — Monetization

- [ ] **Subscription tiers**
  - Free: ads (client-side), limited cache storage (2GB)
  - Plus ($3/mo): no ads, 20GB cache, high-quality streams
  - Pro ($8/mo): unlimited cache, lossless streams, early features

- [ ] **Artist donations**
  - "Support Artist" button on artist pages
  - Stripe integration (one-time or recurring)
  - ЮKassa for Russian market

- [ ] **Artist subscriptions**
  - Subscribe to artist for exclusive content
  - WebSocket feed for new releases

---

## Phase 5 — Platform Expansion

- [ ] **PWA + offline mode**
  - Service Worker for cached audio playback offline
  - Background sync for library updates
  - Install prompt

- [ ] **Desktop app**
  - Tauri wrapper (Rust + WebView2)
  - System media controls (MediaSession API)
  - System tray + global hotkeys

- [ ] **ML recommendations**
  - Collaborative filtering based on listen history
  - Audio fingerprinting for "more like this"
  - Daily/weekly mixes (curated by algorithm)

- [ ] **API for third-party**
  - Public API for developers
  - OAuth2 for third-party apps
  - Embeddable player widget

---

## Technical Debt / Nice-to-have

- [ ] WebSockets for real-time cache status updates (replace polling)
- [ ] End-to-end tests with Playwright
- [ ] Backend unit tests with Jest
- [ ] CI/CD with GitHub Actions
- [ ] Sentry for error tracking
- [ ] Prometheus + Grafana metrics
- [ ] Kubernetes Helm chart
- [ ] CDN integration for cached audio delivery (Cloudflare R2)
- [ ] Lyric scraping (Genius API)
