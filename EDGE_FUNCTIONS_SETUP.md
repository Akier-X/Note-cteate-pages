# Edge Functions セットアップガイド

このプロジェクトでは、AI生成ロジックをSupabase Edge Functionsに移行しました。

## 📁 ファイル構成

```
supabase/functions/
├── generate-outline/
│   └── index.ts          # 記事構成生成（JSON解析含む）
├── generate-article/
│   └── index.ts          # 記事本文生成・続き生成
├── article-helpers/
│   └── index.ts          # プロンプト構築・データ変換
└── note-import/
    └── index.ts          # note.com記事インポート
```

## 🚀 デプロイ手順

### 前提条件
- Suabase CLI をインストール
- Suabaseプロジェクトにログイン済み

### 1. Suabase CLI インストール

```bash
npm install -g supabase
```

### 2. プロジェクトをリンク

```bash
supabase link --project-ref ujymuexfxhuvrpkprkch
```

### 3. 環境変数を設定

Suabaseダッシュボール → Settings → Environment を開き、以下を追加：

```
ANTHROPIC_API_KEY=sk-ant-xxxxxx
```

### 4. Edge Functions をデプロイ

```bash
supabase functions deploy generate-outline --no-verify-jwt
supabase functions deploy generate-article --no-verify-jwt
supabase functions deploy article-helpers --no-verify-jwt
```

### 5. デプロイ確認

```bash
supabase functions list
```

## 📡 API エンドポイント

### `generate-outline`
**URL:** `https://ujymuexfxhuvrpkprkch.supabase.co/functions/v1/generate-outline`

**リクエスト:**
```json
{
  "theme": "AIについて",
  "kw": "AI, 機械学習",
  "tone": "カジュアル",
  "aud": "初心者",
  "len": "中（2000〜3000字）",
  "paid": false,
  "userInst": "実例を多く交えてください"
}
```

**レスポンス:**
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

---

### `generate-article`
**URL:** `https://ujymuexfxhuvrpkprkch.supabase.co/functions/v1/generate-article`

**リクエスト（生成）:**
```json
{
  "action": "generate",
  "sel": "AIについて",
  "theme": "AIについて",
  "kw": "AI",
  "tone": "カジュアル",
  "aud": "初心者",
  "len": "中（2000〜3000字）",
  "outline": {...},
  "paid": false,
  "userInst": ""
}
```

**リクエスト（続き生成）:**
```json
{
  "action": "continue",
  "sel": "タイトル",
  "theme": "テーマ",
  "tone": "トーン",
  "raw": "途中までの本文"
}
```

**リクエスト（再生成）:**
```json
{
  "action": "regen",
  "sel": "タイトル",
  "theme": "テーマ",
  "tone": "トーン",
  "aud": "読者",
  "editText": "ユーザー編集済み原稿",
  "editNote": "修正指示",
  "len": "中（2000〜3000字）"
}
```

**レスポンス:**
```json
{
  "body": "記事本文（Markdown）"
}
```

---

### `article-helpers`
**URL:** `https://ujymuexfxhuvrpkprkch.supabase.co/functions/v1/article-helpers`

**リクエスト例:**
```json
{
  "action": "makeNBPrompt",
  "imageDesc": "Modern concept of AI",
  "heading": "AIとは",
  "iStyle": "写真風",
  "iAsp": "16:9"
}
```

**サポート action:**
- `makeNBPrompt`: NanoBanana画像プロンプト生成
- `makeEyecatch`: アイキャッチ生成
- `extractNB`: 記事内のNB指示抽出
- `buildSeriesContext`: シリーズコンテキスト構築
- `buildSeriesLinks`: シリーズリンク構築
- `buildRefLinks`: 参考文献リンク構築
- `countImg`: 画像数カウント

---

## 🔒 セキュリティ

- **APIキーはEdge Function内に保存**：フロントエンドに露出しない
- **環境変数で管理**：`ANTHROPIC_API_KEY`をSupabaseの環境変数として設定
- **JWT検証無効**：`--no-verify-jwt`デプロイオプションで開発利便性を確保

## 📊 比較：Before / After

| 項目 | Before | After |
|---|---|---|
| **App.jsx 行数** | 890行 | 350行 |
| **APIキー露出** | フロント側 | Edge Function内（非露出） |
| **JSON解析** | フロント側 | サーバー側 |
| **プロンプト構築** | フロント側 | サーバー側 |

## 🐛 トラブルシューティング

### デプロイ失敗

```bash
# ログを確認
supabase functions download generate-outline

# 再度デプロイ
supabase functions deploy generate-outline --no-verify-jwt
```

### 環境変数が読み込まれていない

Suabaseダッシュボール → Functions → 関数名 → Environment で確認

### CORSエラー

Edge Functionに以下のヘッダーが含まれていることを確認：
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}
```

## 📚 参考リンク

- [Suabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)
- [Deno Documentation](https://deno.land/)
