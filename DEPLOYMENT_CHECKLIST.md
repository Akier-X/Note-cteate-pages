# 🚀 デプロイメント チェックリスト

Suabaseへの本番デプロイ前に、以下を確認してください。

## ✅ 前提条件

- [ ] Node.js 16+ をインストール
- [ ] Suabase CLI をインストール
  ```bash
  npm install -g supabase
  ```
- [ ] Suabaseプロジェクトが作成済み
  - Project ID: `ujymuexfxhuvrpkprkch`
  - URL: `https://ujymuexfxhuvrpkprkch.supabase.co`

---

## 📋 ローカル環境セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

**確認:**
```bash
npm list @supabase/supabase-js
npm list vite
```

### 2. 環境変数の確認

`.env.local` に以下が設定されていること：

```env
VITE_SUPABASE_URL=https://ujymuexfxhuvrpkprkch.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs... (既に設定済み)
VITE_ANTHROPIC_API_KEY= (空でOK - Edge Functionで使用)
```

### 3. ローカル開発サーバーで動作確認

```bash
npm run dev
```

- [ ] `http://localhost:3000` にアクセス可能
- [ ] UI が正常に表示される
- [ ] DB接続エラーが表示されない（接続テスト）

---

## 🌐 Suabase 側の準備

### 1. データベーステーブル作成

Suabaseダッシュボール → SQL Editor で実行：

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

- [ ] テーブル作成完了
- [ ] Suabaseダッシュボール → Tables で確認

### 2. 環境変数設定（Edge Functions用）

Suabaseダッシュボール → Functions → Environment：

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

- [ ] 環境変数設定完了

---

## 🔧 Edge Functions デプロイ

### 方法1: 自動デプロイスクリプト（推奨）

```bash
bash deploy-edge-functions.sh
```

### 方法2: 手動デプロイ

```bash
# プロジェクトをリンク
supabase link --project-ref ujymuexfxhuvrpkprkch

# 各関数をデプロイ
supabase functions deploy generate-outline --no-verify-jwt
supabase functions deploy generate-article --no-verify-jwt
supabase functions deploy article-helpers --no-verify-jwt
supabase functions deploy note-import --no-verify-jwt

# デプロイ確認
supabase functions list
```

- [ ] generate-outline デプロイ完了
- [ ] generate-article デプロイ完了
- [ ] article-helpers デプロイ完了
- [ ] note-import デプロイ完了

---

## ✨ デプロイ後の動作確認

### 1. Edge Functions の動作確認

Suabaseダッシュボール → Functions で各関数をテスト：

#### generate-outline テスト

**Request:**
```json
{
  "theme": "テストテーマ",
  "kw": "キーワード",
  "tone": "カジュアル",
  "aud": "初心者",
  "len": "中（2000〜3000字）",
  "paid": false,
  "userInst": ""
}
```

**Expected Response:**
```json
{
  "outline": {
    "titles": ["...", "...", "..."],
    "sections": [...],
    "hashtags": [...],
    "seoDescription": "..."
  }
}
```

- [ ] 成功（200 OK）

#### article-helpers テスト

**Request:**
```json
{
  "action": "makeNBPrompt",
  "imageDesc": "Modern AI concept",
  "heading": "AIとは",
  "iStyle": "写真風",
  "iAsp": "16:9"
}
```

**Expected Response:**
```json
{
  "prompt": "Modern AI concept. photorealistic, high resolution. landscape 16:9. Japanese aesthetic..."
}
```

- [ ] 成功（200 OK）

### 2. フロントエンド動作確認

```bash
npm run dev
```

#### テストケース1: 記事構成生成

1. テーマ入力: "AIの基礎知識"
2. 「構成を生成する」をクリック
3. 成功確認：
   - [ ] 構成が表示される
   - [ ] タイトル3つが表示される
   - [ ] ハッシュタグが8個以上表示される

#### テストケース2: 記事生成（Edge Function が Anthropic API キー設定済みの場合）

1. タイトル選択
2. 「記事を生成」をクリック
3. 成功確認：
   - [ ] 記事本文が生成される
   - [ ] Markdown形式が正しい
   - [ ] 見出し（##）から始まっている

#### テストケース3: DB保存

1. 記事生成後「保存」をクリック
2. 成功確認：
   - [ ] ステータスが「saving」→「saved」に変わる
   - [ ] 記事ライブラリに表示される

#### テストケース4: note.comインポート

1. 📥 タブを開く
2. URLからインポート選択
3. note.com 記事URLを入力
4. 成功確認：
   - [ ] プレビューが表示される
   - [ ] 「DBに保存」で保存できる

---

## 🔍 トラブルシューティング

### Edge Function がエラーを返す

```bash
# ログを確認
supabase functions download generate-outline

# エラーメッセージを確認して修正
```

### Anthropic API エラー

- [ ] Suabaseダッシュボール → Functions → Environment で `ANTHROPIC_API_KEY` が設定されているか確認
- [ ] APIキーが有効か確認
- [ ] CORS エラーの場合は Edge Function の corsHeaders を確認

### DB接続エラー

- [ ] Suabaseダッシュボール → API で Anon Key を確認
- [ ] `.env.local` の `VITE_SUPABASE_ANON_KEY` が正しいか確認
- [ ] テーブルが作成されているか確認

---

## 🎉 デプロイ完了

すべてのチェックボックスにチェックが入ったら、デプロイ完了です！

### 本番環境への公開

```bash
npm run build
# build/ ディレクトリをホスティングサービスにアップロード
```

---

## 📞 サポート

問題が発生した場合：

1. ログを確認：`supabase functions download <function-name>`
2. EDGE_FUNCTIONS_SETUP.md を参照
3. Suabase ドキュメント：https://supabase.com/docs/guides/functions
