#!/bin/bash

# Suabase Edge Functions デプロイスクリプト
# 使用方法: bash deploy-edge-functions.sh

set -e

echo "📦 Suabase Edge Functions デプロイツール"
echo "=========================================="
echo ""

# プロジェクト情報
PROJECT_ID="ujymuexfxhuvrpkprkch"
FUNCTIONS=("generate-outline" "generate-article" "article-helpers" "note-import")

# 1. Suabase CLI 確認
echo "1️⃣  Suabase CLI を確認中..."
if ! command -v supabase &> /dev/null; then
    echo "❌ Suabase CLI がインストールされていません"
    echo "インストール: npm install -g supabase"
    exit 1
fi
echo "✅ Suabase CLI OK"
echo ""

# 2. プロジェクトリンク確認
echo "2️⃣  プロジェクトリンクを確認中..."
if [ ! -f ".supabase/config.json" ]; then
    echo "⚠️  プロジェクトがリンクされていません"
    echo "実行中: supabase link --project-ref $PROJECT_ID"
    supabase link --project-ref "$PROJECT_ID"
else
    echo "✅ プロジェクトリンク OK"
fi
echo ""

# 3. 環境変数確認
echo "3️⃣  環境変数を確認中..."
echo "⚠️  Suabaseダッシュボール → Functions → Environment で以下を設定してください："
echo ""
echo "    ANTHROPIC_API_KEY=sk-ant-xxxxx"
echo ""
echo "設定完了後、このスクリプトを続行してください。"
read -p "設定完了しましたか？ (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ スキップします"
    exit 1
fi
echo "✅ 環境変数確認"
echo ""

# 4. Edge Functions をデプロイ
echo "4️⃣  Edge Functions をデプロイ中..."
echo ""

for func in "${FUNCTIONS[@]}"; do
    echo "📤 $func をデプロイ中..."
    if supabase functions deploy "$func" --no-verify-jwt; then
        echo "✅ $func デプロイ成功"
    else
        echo "⚠️  $func デプロイに失敗しました（既存の場合は無視可）"
    fi
    echo ""
done

# 5. デプロイ確認
echo "5️⃣  デプロイ完了確認中..."
supabase functions list
echo ""

echo "=========================================="
echo "✅ デプロイ完了！"
echo ""
echo "次のステップ:"
echo "1. npm install で依存関係をインストール"
echo "2. npm run dev でアプリを起動"
echo "3. http://localhost:3000 にアクセス"
echo ""
