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
    const { action, imageDesc, heading, iStyle, iAsp, title, theme, arts, forSr } =
      await req.json()

    let result: any = {}

    if (action === "makeNBPrompt") {
      result = makeNBPrompt(imageDesc, heading, iStyle, iAsp)
    } else if (action === "makeEyecatch") {
      result = makeEyecatch(title, theme, iStyle)
    } else if (action === "extractNB") {
      result = extractNB(imageDesc) // imageDescは実際にはraw
    } else if (action === "buildSeriesContext") {
      result = buildSeriesContext(arts, forSr)
    } else if (action === "buildSeriesLinks") {
      result = buildSeriesLinks(arts, forSr)
    } else if (action === "buildRefLinks") {
      result = buildRefLinks(imageDesc) // 参考文献配列が渡される
    } else if (action === "countImg") {
      result = countImg(imageDesc) // rawが渡される
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})

function makeNBPrompt(desc: string, heading: string, iStyle: string, iAsp: string): string {
  const styles: Record<string, string> = {
    写真風: "photorealistic, high resolution",
    イラスト風: "digital illustration, vibrant",
    フラットデザイン: "flat design, modern",
    水彩画風: "watercolor, soft colors",
    アニメ風: "anime style, cel-shaded",
    ミニマル: "minimalist, clean",
  }
  const aspects: Record<string, string> = {
    "16:9": "landscape 16:9",
    "1:1": "square 1:1",
    "9:16": "portrait 9:16",
  }
  return `${desc}. ${styles[iStyle] || "photorealistic"}. ${aspects[iAsp] || "landscape 16:9"}. Japanese aesthetic. If person: Japanese. For ${heading}. No text, no watermark.`
}

function makeEyecatch(title: string, theme: string, iStyle: string): string {
  const styles: Record<string, string> = {
    写真風: "photorealistic, cinematic",
    イラスト風: "illustration, vibrant",
    フラットデザイン: "flat design",
    水彩画風: "watercolor",
    アニメ風: "anime style",
    ミニマル: "minimalist",
  }
  return `Eye-catching hero: ${title}. ${theme}. ${styles[iStyle] || "photorealistic"}. 16:9, hero for blog. If person: Japanese. No text.`
}

function extractNB(raw: string): string[] {
  if (!raw) return []
  const ps: string[] = []
  const ls = raw.split("\n")

  for (let i = 0; i < ls.length; i++) {
    const l = ls[i]
    if (isNBLine(l)) {
      const b: string[] = [l.trim()]
      let j = i + 1
      while (
        j < ls.length &&
        ls[j].trim() &&
        ls[j].trim().indexOf("##") !== 0 &&
        ls[j].trim().charAt(0) !== "※"
      ) {
        b.push(ls[j].trim())
        j++
      }
      const m = b.join("\n").match(/[「『](.+?)[」』]/s)
      if (m) ps.push(m[1])
    }
  }
  return ps
}

function isNBLine(l: string): boolean {
  return (
    (l.indexOf("NanoBanana") !== -1 || l.indexOf("📷") !== -1) &&
    (l.indexOf("prompt") !== -1 || l.indexOf("NanoBanana") !== -1)
  )
}

function countImg(raw: string): number {
  return raw
    ? raw
        .split("\n")
        .filter((l) => isNBLine(l.trim())).length
    : 0
}

function buildSeriesContext(arts: any[], forSr: string | null): string {
  if (!forSr) return ""

  const prevArts = arts.filter((a) => a.series_id === forSr).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  if (!prevArts.length) {
    return "\nこれはシリーズの第1回（導入回）です。読者を惹きつける導入を書き、次回への期待を持たせてください。"
  }

  let ctx = `\n\n【シリーズ情報 - 重要】\nこれはシリーズの第${prevArts.length + 1}回です。前回までの流れを踏まえ、自然な続きとして書いてください。\n`

  prevArts.slice(-3).forEach((a, i) => {
    const summary = a.raw ? a.raw.slice(0, 600) : ""
    ctx += `\n--- 第${prevArts.length - 3 + i + 1}回: ${a.title} ---\n`
    ctx += `冒頭概要: ${summary.split("\n").slice(0, 5).join(" ").slice(0, 200)}\n`
  })

  ctx += "\n【ストーリー継続のルール】\n"
  ctx += "1. 前回の結論やまとめを受けて、自然に今回のテーマに繋げる\n"
  ctx += "2. 読者が前回から成長・進展を感じられる構成にする\n"

  return ctx
}

function buildSeriesLinks(arts: any[], forSr: string | null): string {
  if (!forSr) return ""

  const sa = arts
    .filter((a) => a.series_id === forSr)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  if (!sa.length) {
    return "\n\n---\n\nシリーズ「」第1回です。"
  }

  const links = sa.map((a, i) => `- 第${i + 1}回: ${a.title}`).join("\n")
  return `\n\n---\n\nシリーズ\n${links}\n- 第${sa.length + 1}回: 本記事`
}

function buildRefLinks(refs: any[]): string {
  if (!refs || refs.length === 0) return ""
  return "\n\n---\n\n参考文献\n" + refs.map((r, i) => `${i + 1}. [${r.title}](${r.url})`).join("\n")
}
