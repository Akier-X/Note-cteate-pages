# 📝 note記事ジェネレーター

Suabase DB連携とnote.com記事インポート機能を搭載したnote.com記事自動生成ツール。

## 🎯 機能

- ✅ **Suabase DB連携**：記事・シリーズ・参考文献をRDBで管理
- ✅ **記事の自動生成**：Claude APIで記事構成・本文を生成
- ✅ **記事インポート**：note.comの記事URLから一括インポート
- ✅ **シリーズ管理**：記事をシリーズでグループ化
- ✅ **タグ・参考文献管理**：柔軟なメタデータ管理
- ✅ **有料記事対応**：価格・無料セクション設定

## 🚀 セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local` に以下を記入：

```env
VITE_SUPABASE_URL=https://ujymuexfxhuvrpkprkch.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
VITE_ANTHROPIC_API_KEY=sk-ant-...  # オプション（記事生成機能用）
```

### 3. Suabase テーブルの作成

Suabaseダッシュボード → SQL Editor で以下を実行：

```sql
-- articles テーブル
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  theme TEXT,
  kw TEXT,
  tone TEXT,
  aud TEXT,
  len TEXT,
  raw TEXT,
  tags TEXT[],
  paid BOOLEAN,
  price TEXT,
  pidx INT,
  outline JSONB,
  eyecatch TEXT,
  seo TEXT,
  userInst TEXT,
  series_id UUID,
  iStyle TEXT,
  iAsp TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- series テーブル
CREATE TABLE series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- references テーブル
CREATE TABLE references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  title TEXT,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX idx_articles_series_id ON articles(series_id);
CREATE INDEX idx_references_article_id ON references(article_id);
```

### 4. Edge Functions デプロイ（重要）

記事生成機能を使う場合、以下のEdge Functionsをデプロイする必要があります：

```bash
bash deploy-edge-functions.sh
```

または手動で：

```bash
supabase link --project-ref ujymuexfxhuvrpkprkch
supabase functions deploy generate-outline --no-verify-jwt
supabase functions deploy generate-article --no-verify-jwt
supabase functions deploy article-helpers --no-verify-jwt
supabase functions deploy note-import --no-verify-jwt
```

詳細は **EDGE_FUNCTIONS_SETUP.md** と **DEPLOYMENT_CHECKLIST.md** を参照してください。

## 💻 開発

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開く

## 📚 テーブル構造

### articles
- `id`: UUID（主キー）
- `title`: 記事タイトル
- `theme`: テーマ
- `kw`: キーワード
- `raw`: 記事本文（Markdown）
- `tags`: ハッシュタグ（配列）
- `outline`: 記事構成（JSON）
- `series_id`: シリーズID（外部キー）
- その他：トーン・文字数・有料設定など

### series
- `id`: UUID（主キー）
- `name`: シリーズ名

### references
- `id`: UUID（主キー）
- `article_id`: 記事ID（外部キー）
- `title`: 参考文献タイトル
- `url`: URL

## 🎮 UI操作

### 📝 編集タブ（✏️）
1. **Step 0: テーマ・設定** - 基本情報入力
2. **Step 1: 構成** - タイトル・見出し選択
3. **Step 2: 記事生成** - 最終記事調整・DB保存

### 📚 ライブラリ（📚）
保存済みの記事一覧表示

### 📖 シリーズ（📖）
シリーズの作成・管理

### 📥 インポート（📥）
note.comからの記事インポート

## ⚠️ 注意事項

- **Claude API キーなし**：記事生成機能は使えません。手動記事作成またはインポートをご利用ください
- **Edge Function**：note.com非公式APIを使用。仕様変更の可能性あり（2025年2月現在は動作確認済み）

## 📝 ライセンス

プライベートプロジェクト
