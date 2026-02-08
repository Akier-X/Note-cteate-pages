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
    const { theme, kw, tone, aud, len, seriesCtx, paid, userInst } = await req.json()
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY")

    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured")
    }

    // 構成生成プロンプト
    const pr = paid ? "\n有料記事として構成。各sectionにisFreeを付与。" : ""
    const iff = paid ? ',"isFree":true' : ""

    const prompt = `あなたはnote.comのプロ記事構成作家です。以下の情報から記事構成をJSON形式で出力してください。

テーマ: ${theme}
キーワード: ${kw || "なし"}
トーン: ${tone}
想定読者: ${aud || "一般"}
文字数: ${len}
${seriesCtx || ""}
${pr}

${userInst?.trim() ? `【ユーザーからの追加指示】\n${userInst}` : ""}

【出力JSON形式（厳守）】
以下の形式のJSONのみを出力してください。説明文やmarkdownコードブロックは絶対に付けないでください。

{"titles":["魅力的な日本語タイトル候補1","魅力的な日本語タイトル候補2","魅力的な日本語タイトル候補3"],"sections":[{"heading":"見出し","level":"h2","summary":"内容概要","hasImage":true,"imageDesc":"ENGLISH image description"${iff},"subheadings":[]}],"hashtags":["タグ1","タグ2","タグ3","タグ4","タグ5","タグ6","タグ7","タグ8"],"seoDescription":"SEO説明文120文字以内","eyecatchDesc":"ENGLISH thumbnail description"}

【絶対ルール】
- titlesは必ず3つ、すべて日本語
- hashtagsは必ず8つ以上、すべて日本語（#記号不要）、テーマに関連するタグを幅広く
- imageDescとeyecatchDescのみ英語
- JSON以外の文字を一切含めない
- 最初の文字を { にすること
- ユーザーの追加指示がある場合は必ずその内容を構成に反映すること`

    // Claude API呼び出し
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: "note.com記事構成作家。純粋なJSONのみ出力。{で始まり}で終わるJSONのみ。",
        messages: [{ role: "user", content: prompt }],
      }),
    })

    const data = await response.json()
    if (data.error) {
      throw new Error(data.error.message)
    }

    const text = data.content.map((b: any) => b.text || "").join("\n")
    const outline = safeJSON(text, theme)

    return new Response(
      JSON.stringify({
        outline,
        truncated: data.stop_reason === "max_tokens",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})

// JSON解析関数
function safeJSON(txt: string, theme: string) {
  let s = txt.replace(/^[\s\S]*?```(?:json)?\s*\n?/, "").replace(/\n?\s*```[\s\S]*$/, "").trim()
  if (s.indexOf("{") === -1) s = txt

  const st = s.indexOf("{")
  if (st < 0) return fallbackOL(theme)

  let dp = 0
  let en = -1
  for (let j = st; j < s.length; j++) {
    if (s[j] === "{") dp++
    else if (s[j] === "}") {
      dp--
      if (dp === 0) {
        en = j
        break
      }
    }
  }

  if (en < 0) {
    s = s.slice(st)
    s = s.replace(/,\s*"[^"]*$/, "").replace(/,\s*$/, "")
    const ob = (s.match(/{/g) || []).length
    const cb = (s.match(/}/g) || []).length
    const oq = (s.match(/\[/g) || []).length
    const cq = (s.match(/]/g) || []).length
    for (let k = 0; k < oq - cq; k++) s += "]"
    for (let k2 = 0; k2 < ob - cb; k2++) s += "}"
    s = s.replace(/,\s*([}\]])/g, "$1")
    try {
      return validateOL(JSON.parse(s), theme)
    } catch (e) {
      return fallbackOL(theme)
    }
  }

  s = s
    .slice(st, en + 1)
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/'/g, '"')
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
  try {
    return validateOL(JSON.parse(s), theme)
  } catch (e) {
    return fallbackOL(theme)
  }
}

function fallbackOL(theme: string) {
  return {
    titles: [`${theme}について`, `${theme}の完全ガイド`, `${theme}入門`],
    sections: [
      {
        heading: "はじめに",
        level: "h2",
        summary: "導入・背景",
        hasImage: true,
        imageDesc: `Modern concept of ${theme}`,
        subheadings: [],
      },
      {
        heading: "詳細解説",
        level: "h2",
        summary: "本論",
        hasImage: true,
        imageDesc: `Detailed illustration about ${theme}`,
        subheadings: [],
      },
      {
        heading: "まとめ",
        level: "h2",
        summary: "まとめと次のアクション",
        hasImage: false,
        imageDesc: "",
        subheadings: [],
      },
    ],
    hashtags: ["ブログ", "ライフハック", "学び", "tips", "日本語", "note", "まとめ", "おすすめ"],
    seoDescription: `${theme}について詳しく解説します。`,
  }
}

function validateOL(p: any, theme: string) {
  if (!p || typeof p !== "object") return fallbackOL(theme)

  if (
    !p.titles ||
    !Array.isArray(p.titles) ||
    p.titles.length === 0 ||
    p.titles.every((t: any) => !t || !t.trim?.())
  ) {
    p.titles = [`${theme}について`, `${theme}の完全ガイド`, `${theme}入門`]
  }
  p.titles = p.titles.filter((t: any) => t && t.trim?.())
  if (p.titles.length < 2) {
    p.titles.push(`${theme}の完全ガイド`)
    p.titles.push(`${theme}入門`)
  }

  if (
    !p.hashtags ||
    !Array.isArray(p.hashtags) ||
    p.hashtags.length === 0 ||
    p.hashtags.every((h: any) => !h || !h.trim?.())
  ) {
    p.hashtags = ["ブログ", "ライフハック", "学び", "tips", "日本語"]
  }
  p.hashtags = p.hashtags
    .filter((h: any) => h && h.trim?.())
    .map((h: any) => h.replace(/^#/, ""))
  while (p.hashtags.length < 8) p.hashtags.push("note記事")

  if (!p.sections || !Array.isArray(p.sections) || p.sections.length === 0) {
    p.sections = fallbackOL(theme).sections
  }
  if (!p.seoDescription) p.seoDescription = `${theme}について詳しく解説します。`

  return p
}
