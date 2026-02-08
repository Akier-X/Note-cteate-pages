// Supabase Edge Function: note-import
// このコードをSupabaseダッシュボードで以下のように作成してください：
// - 関数名: note-import
// - メソッド: POST
// - URL: https://ujymuexfxhuvrpkprkch.supabase.co/functions/v1/note-import

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { key, username } = await req.json()

    if (key) {
      // 単一記事の取得
      const articleRes = await fetch(
        `https://note.com/api/v3/notes/${key}`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      )
      const article = await articleRes.json()

      // HTML to Markdown簡易変換
      const markdown = htmlToMarkdown(article.body || "")

      return new Response(
        JSON.stringify({
          title: article.name,
          description: article.summary,
          body: article.body,
          markdown: markdown,
          html: article.body,
          tags: article.tags ? article.tags.map((t: any) => t.name) : [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (username) {
      // ユーザーの記事一覧取得
      const listRes = await fetch(
        `https://note.com/api/v2/creators/${username}/contents?kind=note`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      )
      const listData = await listRes.json()

      return new Response(
        JSON.stringify({
          articles: (listData.data || []).map((item: any) => ({
            key: item.key,
            title: item.name,
            description: item.summary,
            tags: item.tags ? item.tags.map((t: any) => t.name) : [],
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(JSON.stringify({ error: "key or username required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})

function htmlToMarkdown(html: string): string {
  if (!html) return ""
  let markdown = html
    .replace(/<h1[^>]*>([^<]*)<\/h1>/gi, "# $1\n")
    .replace(/<h2[^>]*>([^<]*)<\/h2>/gi, "## $1\n")
    .replace(/<h3[^>]*>([^<]*)<\/h3>/gi, "### $1\n")
    .replace(/<h4[^>]*>([^<]*)<\/h4>/gi, "#### $1\n")
    .replace(/<strong[^>]*>([^<]*)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>([^<]*)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>([^<]*)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>([^<]*)<\/i>/gi, "*$1*")
    .replace(/<u[^>]*>([^<]*)<\/u>/gi, "__$1__")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, "[$2]($1)")
    .replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, "![$2]($1)")
    .replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, "![]($1)")
    .replace(/<li[^>]*>([^<]*)<\/li>/gi, "- $1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>([^<]*)<\/p>/gi, "$1\n\n")
    .replace(/<div[^>]*>([^<]*)<\/div>/gi, "$1\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()

  return markdown
}
