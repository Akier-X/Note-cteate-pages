# 🏗️ アーキテクチャ概要

## システム構成

```
┌─────────────────────────────────────────────────────────────┐
│                   ブラウザ（フロントエンド）                    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ React App (App.jsx - 350行)                         │   │
│  │ - UI レイアウト・操作                               │   │
│  │ - Suabase DB 連携（記事・シリーズ保存）            │   │
│  │ - Edge Functions への fetch 呼び出し               │   │
│  │ - 状態管理（useState）                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  環境変数:                                                     │
│  - VITE_SUPABASE_URL                                          │
│  - VITE_SUPABASE_ANON_KEY                                     │
│  - VITE_ANTHROPIC_API_KEY (未使用)                            │
└─────────────────────────────────────────────────────────────┘
           ↕ REST API (fetch)           ↕ REST API (fetch)
┌──────────────────────────────────┐  ┌──────────────────────┐
│   Supabase Edge Functions        │  │ Suabase Realtime DB  │
│                                   │  │                      │
│ 🔧 generate-outline             │  │ 📊 articles          │
│   - テーマから構成を生成        │  │ 📊 series            │
│   - JSON解析・バリデーション    │  │ 📊 references        │
│   - Claude API呼び出し          │  │                      │
│                                   │  │ Postgre SQL 15       │
│ 🔧 generate-article             │  └──────────────────────┘
│   - 記事本文生成                 │
│   - 続き生成                     │
│   - 再生成                       │
│   - Claude API呼び出し          │
│                                   │
│ 🔧 article-helpers              │  ┌──────────────────────┐
│   - プロンプト構築              │  │ note.com API         │
│   - データ変換                  │  │ (非公式)             │
│   - ヘルパー関数実行           │  │                      │
│                                   │  │ v3 API endpoint      │
│ 🔧 note-import                  │  └──────────────────────┘
│   - note.com記事フェッチ        │
│   - HTML → Markdown 変換       │
│   - note API呼び出し           │
│                                   │
│ 環境変数:                        │
│ - ANTHROPIC_API_KEY             │
└──────────────────────────────────┘
           ↕ REST API
┌──────────────────────────────────┐
│   Anthropic Claude API           │
│                                   │
│ - claude-sonnet-4-20250514       │
│ - 記事構成生成（4000トークン）   │
│ - 記事本文生成（5000-12000）     │
│ - 続き生成（6000トークン）       │
└──────────────────────────────────┘
```

---

## データフロー

### 記事生成フロー

```
User Input (テーマ、トーン等)
    ↓
React State
    ↓
genOL() → fetch("/api/generate-outline", {...})
    ↓
Edge Function: generate-outline
    - Anthropic APIを呼び出し
    - Claude: テーマから記事構成を生成
    - safeJSON: JSON解析
    - validateOL: バリデーション
    ↓
JSON構成を返却
    ↓
App.jsx: 構成を state に保存
    ↓
ユーザー: タイトル・見出し確認・編集
    ↓
genArt() → fetch("/api/generate-article", {action: "generate", ...})
    ↓
Edge Function: generate-article
    - Anthropic APIを呼び出し
    - Claude: 構成に基づいて記事本文を生成
    - 最大3回の続き生成（MAX_CONTINUES）
    - cleanArticleBody: 前処理・整形
    ↓
Markdown形式の記事本文を返却
    ↓
App.jsx: raw state に保存
    ↓
renderBody: Markdown → React JSX に変換して表示
    ↓
ユーザー: 編集・確認
    ↓
saveArt() → Suabase.from("articles").insert({...})
    ↓
記事が DB に保存される
```

---

## ファイル構成

```
/home/user/Note-cteate-pages/
├── App.jsx                              ← メインアプリケーション（350行）
├── main.jsx                             ← React エントリーポイント
├── index.html                           ← HTMLエントリーポイント
├── package.json                         ← 依存パッケージ
├── vite.config.js                       ← Vite ビルド設定
├── .env.local                           ← 環境変数（gitignore対象）
├── .gitignore                           ← git 除外設定
│
├── README.md                            ← プロジェクト概要
├── ARCHITECTURE.md                      ← このファイル
├── EDGE_FUNCTIONS_SETUP.md              ← Edge Functions セットアップガイド
├── DEPLOYMENT_CHECKLIST.md              ← デプロイ前チェックリスト
├── deploy-edge-functions.sh             ← デプロイスクリプト
│
├── App-original.jsx                     ← オリジナル版（参考用）
│
└── supabase/
    ├── config.toml                      ← Suabase設定
    └── functions/
        ├── generate-outline/
        │   └── index.ts                 ← 構成生成EF
        ├── generate-article/
        │   └── index.ts                 ← 記事生成EF
        ├── article-helpers/
        │   └── index.ts                 ← ヘルパー関数EF
        └── note-import/
            └── index.ts                 ← note.comインポートEF
```

---

## 依存パッケージ

### Production
- `@supabase/supabase-js` (v2.45+)
  - Suabase Realtime DB クライアント
  - 記事・シリーズのCRUD操作

- `react` (v18.2+)
- `react-dom` (v18.2+)
  - UIフレームワーク

### Development
- `vite` (v5.0+)
  - ビルドツール
- `@vitejs/plugin-react` (v4.2+)
  - React プラグイン

---

## 主要な関数・コンポーネント

### App.jsx（React Component）

#### State 管理
- `view`: 表示タブ（edit/lib/sr/imp）
- `step`: エディタステップ（0=入力/1=構成/2=記事生成）
- `theme`, `kw`, `tone`, `len`, `aud`: 記事基本設定
- `outline`: 生成された記事構成（JSON）
- `raw`: 生成された記事本文（Markdown）
- `arts`: DB保存記事一覧
- `series`: シリーズ一覧

#### 主要関数
- `genOL()`: 構成生成（Edge Function呼び出し）
- `genArt()`: 記事生成（Edge Function呼び出し）
- `continueArt()`: 続き生成（Edge Function呼び出し）
- `regenFromEdit()`: 編集内容で再生成（Edge Function呼び出し）
- `saveArt()`: Suabase に記事保存
- `delArt()`: 記事削除
- `mkSr()`: シリーズ作成
- `renderBody()`: Markdown → JSX 変換表示

### Edge Functions

#### generate-outline/index.ts
```typescript
interface Request {
  theme: string
  kw?: string
  tone: string
  aud?: string
  len: string
  paid?: boolean
  userInst?: string
  seriesCtx?: string
}

interface Response {
  outline: {
    titles: string[]
    sections: Section[]
    hashtags: string[]
    seoDescription: string
  }
}

function safeJSON(txt, theme)          // JSON解析（複数フォーマット対応）
function validateOL(obj, theme)        // 構成のバリデーション
function fallbackOL(theme)             // デフォルト構成
```

#### generate-article/index.ts
```typescript
interface Request {
  action: "generate" | "continue" | "regen"
  sel: string        // タイトル
  theme: string
  outline?: any
  editText?: string
  editNote?: string
  // ...その他設定
}

interface Response {
  body: string       // Markdown形式の記事本文
  truncated: boolean
}

async function generateArticle()       // 記事生成（複数回の続き生成対応）
async function continueArticle()       // 続き生成
async function regenFromEdit()         // 編集内容で再生成
```

#### article-helpers/index.ts
```typescript
function makeNBPrompt()    // NanoBananaプロンプト生成
function makeEyecatch()    // アイキャッチ説明文生成
function extractNB()       // 記事からNB指示抽出
function buildSeriesContext()   // シリーズ文脈構築
function buildSeriesLinks()     // シリーズリンク生成
function buildRefLinks()       // 参考文献リンク生成
function countImg()           // 画像数カウント
```

---

## セキュリティ考慮事項

### ✅ 実装済み

1. **APIキーの保護**
   - Anthropic API キー: Edge Function 内に閉じこもる
   - Suabase Anon Key: フロント側で使用（テーブルに行レベルセキュリティを設定推奨）

2. **CORS対応**
   - 各Edge Functionに `corsHeaders` を設定
   - ブラウザからのクロスオリジンリクエストを許可

3. **環境変数管理**
   - フロント: `.env.local` （gitignore対象）
   - Edge Function: Suabaseプロジェクトの環境変数

### ⚠️ 本番環境向け推奨事項

1. **行レベルセキュリティ（RLS）の設定**
   ```sql
   ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "user_articles" ON articles
     USING (auth.uid() = user_id);
   ```

2. **認証機能の追加**
   - 現在: 認証なし（Suabase Anon Key使用）
   - 推奨: Email/Password, OAuth認証の実装

3. **CORS設定の厳格化**
   ```typescript
   "Access-Control-Allow-Origin": "https://yourdomain.com"
   ```

4. **レート制限**
   - Edge Functionのレート制限設定
   - Anthropic API呼び出しの制限

---

## パフォーマンス最適化

### 現在の状態

- フロント: 350行（軽量）
- Edge Functions: 各100-200行（高速応答）
- DB: テーブル数3、インデックス2個

### 最適化済み

✅ AI生成ロジックをサーバー側に移譲（キャッシング可能）
✅ JSON解析をサーバー側で実行（パース削減）
✅ 不要なコンポーネント再レンダリング削減

### 将来の改善案

- [ ] 構成のキャッシング（同一テーマの再利用）
- [ ] 記事テンプレートライブラリ
- [ ] WebWorkerで記事プレビュー生成
- [ ] Service Worker でオフライン対応

---

## トラブルシューティング

### Edge Function が 404 エラー

```bash
supabase functions list
# デプロイされているか確認
```

### Anthropic API エラー

```bash
# 環境変数を確認
supabase secrets list
```

### Suabase接続エラー

```typescript
// .env.local を確認
console.log(SUPABASE_URL, SUPABASE_ANON_KEY)
```

---

## 今後の機能追加予定

- [ ] ユーザー認証（複数ユーザー対応）
- [ ] 記事テンプレート機能
- [ ] バッチ生成（複数記事一括生成）
- [ ] 画像自動生成統合（DALL-E, Midjourney等）
- [ ] AI執筆サポート（リアルタイムフィードバック）
- [ ] Web公開機能

