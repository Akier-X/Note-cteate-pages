import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

const TOKEN_MAP: Record<string, number> = {
  "短（1000〜1500字）": 5000,
  "中（2000〜3000字）": 8000,
  "長（3000〜5000字）": 12000,
}
const CONT_TOKENS = 6000
const MAX_CONTINUES = 3

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const {
      action, // "generate", "continue", "regen"
      sel,
      theme,
      kw,
      tone,
      aud,
      len,
      outline,
      seriesCtx,
      paid,
      price,
      pidx,
      raw,
      userInst,
      editText,
      editNote,
    } = await req.json()

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured")
    }

    let result = ""

    if (action === "generate") {
      result = await generateArticle(
        sel,
        theme,
        kw,
        tone,
        aud,
        len,
        outline,
        seriesCtx,
        paid,
        pidx,
        userInst,
        apiKey
      )
    } else if (action === "continue") {
      result = await continueArticle(sel, theme, tone, raw, apiKey)
    } else if (action === "regen") {
      result = await regenFromEdit(
        sel,
        theme,
        tone,
        aud,
        seriesCtx,
        editText,
        editNote,
        len,
        apiKey
      )
    }

    // 記事本文のクリーンアップ
    const body = cleanArticleBody(result, sel)

    return new Response(
      JSON.stringify({
        body,
        truncated: false,
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

async function generateArticle(
  title: string,
  theme: string,
  kw: string,
  tone: string,
  aud: string,
  len: string,
  outline: any,
  seriesCtx: string,
  paid: boolean,
  pidx: number,
  userInst: string,
  apiKey: string
): Promise<string> {
  const secStr = outline.sections
    .map(
      (s: any, i: number) =>
        `${i + 1}. [h2] ${s.heading}: ${s.summary}${s.hasImage ? " [画像あり]" : ""}${
          paid && i === pidx ? " ★有料ライン★" : ""
        }${s.hasImage && s.imageDesc ? `\n[NanoBanana]: ${s.imageDesc}` : ""}${
          s.subheadings
            ? s.subheadings.map((sub: any) => `\n  - [h3] ${sub.heading}: ${sub.summary}`).join("")
            : ""
        }`
    )
    .join("\n")

  const pi = paid ? `\n有料記事（${pidx + 1}円）。セクション${pidx + 1}前に「💰 ここから先は有料部分です」挿入` : ""

  const prompt = `以下の構成でnote.com記事を日本語で執筆。

タイトル: ${title}
テーマ: ${theme}
キーワード: ${kw}
トーン: ${tone}
読者: ${aud || "一般"}
文字数: ${len}

構成:
${secStr}
${seriesCtx || ""}
${pi}

${userInst?.trim() ? `【ユーザーからの追加指示】\n${userInst}` : ""}

【執筆ルール】
1. h2=「## 」h3=「### 」使用。h1不使用
2. タイトルを本文に含めない。## から開始
3. 画像箇所: 📷 NanoBanana prompt:
「English prompt」
4. 段落間空行
5. **太字**、>引用、-箇条書き使用
6. 必ず「## まとめ」で完結
7. 指定文字数を満たすこと`

  const sysPrompt =
    "note.comプロライター。日本語で記事執筆。タイトルは本文に含めない。NanoBananaプロンプトは英語。文字数厳守。必ず最後まで書き切る。"
  const tokens = TOKEN_MAP[len] || 8000

  let fullText = await callClaudeAPI(prompt, sysPrompt, tokens, apiKey)
  let attempt = 0

  while (attempt < MAX_CONTINUES) {
    // 最後が## まとめで終わっているか確認
    if (fullText.includes("## まとめ")) {
      break
    }
    attempt++
    const continueRes = await callClaudeAPI(
      null,
      sysPrompt,
      CONT_TOKENS,
      apiKey,
      [
        { role: "user", content: prompt },
        { role: "assistant", content: fullText },
        { role: "user", content: "中断箇所から続きを。既出部分は繰り返さず。「## まとめ」で完結。" },
      ]
    )
    fullText += "\n" + continueRes.replace(/^\n+/, "")
  }

  return fullText
}

async function continueArticle(
  title: string,
  theme: string,
  tone: string,
  raw: string,
  apiKey: string
): Promise<string> {
  const prompt = `以下の途中記事の続きを。
タイトル: ${title}
テーマ: ${theme}
トーン: ${tone}

記事:
${raw.slice(-2000)}`

  const response = await callClaudeAPI(
    null,
    "note.comプロライター。続きを書く。",
    CONT_TOKENS,
    apiKey,
    [
      { role: "user", content: prompt },
      { role: "assistant", content: "承知しました。" },
      { role: "user", content: "中断直後から続きのみ。「## まとめ」で完結。" },
    ]
  )

  return raw + "\n\n" + response.replace(/^\n+/, "")
}

async function regenFromEdit(
  title: string,
  theme: string,
  tone: string,
  aud: string,
  seriesCtx: string,
  editText: string,
  editNote: string,
  len: string,
  apiKey: string
): Promise<string> {
  const prompt = `以下はユーザーが編集した記事原稿です。この原稿を元に、文章を整え、自然で読みやすいnote.com記事として再生成してください。

タイトル: ${title}
テーマ: ${theme}
トーン: ${tone}
読者: ${aud || "一般"}
${seriesCtx || ""}

${editNote?.trim() ? `【ユーザーからの指示・修正メモ】\n${editNote}` : ""}

【ユーザー編集済み原稿】
${editText}

【再生成ルール】
1. ユーザーの追記・修正内容を最大限活かす
2. 文章の流れを自然に整える
3. 見出し構造（##, ###）を維持
4. NanoBananaプロンプト部分はそのまま保持
5. タイトルは本文に含めない
6. 全体の一貫性を確保`

  let fullText = await callClaudeAPI(
    prompt,
    "note.com記事エディター。ユーザー編集を活かしつつ文章を改善。タイトル非含有。",
    TOKEN_MAP[len] || 8000,
    apiKey
  )

  let attempt = 0
  while (attempt < MAX_CONTINUES) {
    if (fullText.includes("## まとめ")) {
      break
    }
    attempt++
    const continueRes = await callClaudeAPI(
      null,
      "記事エディター。続きを書く。",
      CONT_TOKENS,
      apiKey,
      [
        { role: "user", content: prompt },
        { role: "assistant", content: fullText },
        { role: "user", content: "中断箇所から続きを。「## まとめ」で完結。" },
      ]
    )
    fullText += "\n" + continueRes.replace(/^\n+/, "")
  }

  return fullText
}

async function callClaudeAPI(
  prompt: string | null,
  system: string,
  maxTokens: number,
  apiKey: string,
  messages?: any[]
): Promise<string> {
  const msgs = messages || [{ role: "user", content: prompt }]

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: msgs,
    }),
  })

  const data = await response.json()
  if (data.error) {
    throw new Error(data.error.message)
  }

  return data.content.map((b: any) => b.text || "").join("\n")
}

function cleanArticleBody(fullText: string, title: string): string {
  let body = fullText.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim()
  const lines = body.split("\n")
  let s2 = 0

  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const lt = lines[i].trim()
    if (lt === title || lt === `# ${title}` || lt.replace(/^#+\s*/, "") === title) {
      s2 = i + 1
      continue
    }
    if (lt.indexOf("## ") === 0) {
      s2 = i
      break
    }
    if (lt.charAt(0) !== "#") {
      s2 = i
      break
    }
  }

  return lines.slice(s2).join("\n").replace(/^\n+/, "")
}
