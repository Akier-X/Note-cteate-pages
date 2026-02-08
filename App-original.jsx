import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

var STEPS = ["入力", "構成", "記事生成"];
var TONES = ["カジュアル", "丁寧・フォーマル", "熱量高め", "淡々と解説", "ストーリー調"];
var LENS = ["短（1000〜1500字）", "中（2000〜3000字）", "長（3000〜5000字）"];
var IMGS = ["写真風", "イラスト風", "フラットデザイン", "水彩画風", "アニメ風", "ミニマル"];
var TOKEN_MAP = { "短（1000〜1500字）": 5000, "中（2000〜3000字）": 8000, "長（3000〜5000字）": 12000 };
var CONT_TOKENS = 6000;
var MAX_CONTINUES = 3;

function doCopy(txt, setFn, label) {
  try {
    var ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setFn(label);
    setTimeout(function () { setFn(""); }, 2000);
  } catch (e) { setFn("fail"); setTimeout(function () { setFn(""); }, 2000); }
}

async function callApi(prompt, sys, maxTokens, messages) {
  var msgs = messages || [{ role: "user", content: prompt }];
  var r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY || "" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens || 4000, system: sys, messages: msgs })
  });
  var d = await r.json();
  if (d.error) throw new Error(d.error.message);
  var text = d.content.map(function (b) { return b.text || ""; }).join("\n");
  return { text: text, truncated: d.stop_reason === "max_tokens" };
}

async function fetchNoteArticle(key) {
  if (!supabase) throw new Error("Supabaseが未設定");
  var r = await fetch("/api/note-import", {
    method: "POST",
    body: JSON.stringify({ key: key }),
    headers: { "Content-Type": "application/json" }
  });
  if (!r.ok) throw new Error("記事取得失敗: " + r.statusText);
  return await r.json();
}

async function fetchNoteUserArticles(username) {
  if (!supabase) throw new Error("Supabaseが未設定");
  var r = await fetch("/api/note-import", {
    method: "POST",
    body: JSON.stringify({ username: username }),
    headers: { "Content-Type": "application/json" }
  });
  if (!r.ok) throw new Error("ユーザー記事一覧取得失敗: " + r.statusText);
  return await r.json();
}

var stCard = { background: "white", borderRadius: 10, padding: 16, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" };
var stLabel = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#555" };
var stInput = { width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13, boxSizing: "border-box", outline: "none" };
var stSel = { width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13, background: "white", outline: "none" };
var stTag = { background: "#f0faf8", color: "#2BA89D", padding: "3px 8px", borderRadius: 14, fontSize: 11 };
function btnPrimary(ok) { return { width: "100%", padding: "12px", borderRadius: 9, border: "none", fontSize: 14, fontWeight: 700, background: ok ? "linear-gradient(135deg,#41C9B4,#2BA89D)" : "#ccc", color: "white", cursor: ok ? "pointer" : "not-allowed" }; }
function btnCopy(on) { return { padding: "4px 10px", borderRadius: 5, border: "1px solid #ddd", background: on ? "#41C9B4" : "white", color: on ? "white" : "#555", fontSize: 11, cursor: "pointer" }; }

function fallbackOL(theme) {
  return {
    titles: [theme + "について", theme + "の完全ガイド", theme + "入門"],
    sections: [
      { heading: "はじめに", level: "h2", summary: "導入・背景", hasImage: true, imageDesc: "Modern concept of " + theme, subheadings: [] },
      { heading: "詳細解説", level: "h2", summary: "本論", hasImage: true, imageDesc: "Detailed illustration about " + theme, subheadings: [] },
      { heading: "まとめ", level: "h2", summary: "まとめと次のアクション", hasImage: false, imageDesc: "", subheadings: [] }
    ],
    hashtags: ["ブログ", "ライフハック", "学び", "tips", "日本語", "note", "まとめ", "おすすめ"],
    seoDescription: theme + "について詳しく解説します。"
  };
}

function safeJSON(txt, theme) {
  var s = txt.replace(/^[\s\S]*?```(?:json)?\s*\n?/, "").replace(/\n?\s*```[\s\S]*$/, "").trim();
  if (s.indexOf("{") === -1) s = txt;
  var st = s.indexOf("{");
  if (st < 0) return fallbackOL(theme);
  var dp = 0, en = -1;
  for (var j = st; j < s.length; j++) {
    if (s[j] === "{") dp++;
    else if (s[j] === "}") { dp--; if (dp === 0) { en = j; break; } }
  }
  if (en < 0) {
    s = s.slice(st);
    s = s.replace(/,\s*"[^"]*$/, "").replace(/,\s*$/, "");
    var ob = (s.match(/{/g) || []).length, cb = (s.match(/}/g) || []).length;
    var oq = (s.match(/\[/g) || []).length, cq = (s.match(/]/g) || []).length;
    for (var k = 0; k < oq - cq; k++) s += "]";
    for (var k2 = 0; k2 < ob - cb; k2++) s += "}";
    s = s.replace(/,\s*([}\]])/g, "$1");
    try { return validateOL(JSON.parse(s), theme); } catch (e) { return fallbackOL(theme); }
  }
  s = s.slice(st, en + 1).replace(/,\s*([}\]])/g, "$1").replace(/'/g, '"').replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ");
  try { return validateOL(JSON.parse(s), theme); } catch (e) { return fallbackOL(theme); }
}

function validateOL(p, theme) {
  if (!p || typeof p !== "object") return fallbackOL(theme);
  if (!p.titles || !Array.isArray(p.titles) || p.titles.length === 0) p.titles = [theme + "について", theme + "の完全ガイド", theme + "入門"];
  p.titles = p.titles.filter(function(t){ return t && t.trim(); });
  if (p.titles.length < 2) { p.titles.push(theme + "の完全ガイド"); p.titles.push(theme + "入門"); }
  if (!p.hashtags || !Array.isArray(p.hashtags) || p.hashtags.length === 0) p.hashtags = ["ブログ", "ライフハック", "学び", "tips", "日本語"];
  p.hashtags = p.hashtags.filter(function(h){ return h && h.trim(); }).map(function(h){ return h.replace(/^#/, ""); });
  while (p.hashtags.length < 8) p.hashtags.push("note記事");
  if (!p.sections || !Array.isArray(p.sections) || p.sections.length === 0) p.sections = fallbackOL(theme).sections;
  if (!p.seoDescription) p.seoDescription = theme + "について詳しく解説します。";
  return p;
}

function extractNB(t) {
  if (!t) return [];
  var ps = [], ls = t.split("\n");
  for (var i = 0; i < ls.length; i++) {
    if ((ls[i].indexOf("NanoBanana") !== -1 || ls[i].indexOf("📷") !== -1) && (ls[i].indexOf("prompt") !== -1 || ls[i].indexOf("NanoBanana") !== -1)) {
      var b = [ls[i].trim()]; var j = i + 1;
      while (j < ls.length && ls[j].trim() && ls[j].trim().indexOf("##") !== 0 && ls[j].trim().charAt(0) !== "※") { b.push(ls[j].trim()); j++; }
      var m = b.join("\n").match(/[「『](.+?)[」』]/s);
      if (m) ps.push(m[1]);
    }
  }
  return ps;
}

function countImg(t) { return t ? t.split("\n").filter(function (l) { return (l.indexOf("NanoBanana") !== -1 || l.indexOf("📷") !== -1); }).length : 0; }

export default function App() {
  var _view = useState("edit"), view = _view[0], setView = _view[1];
  var _step = useState(0), step = _step[0], setStep = _step[1];
  var _theme = useState(""), theme = _theme[0], setTheme = _theme[1];
  var _kw = useState(""), kw = _kw[0], setKw = _kw[1];
  var _tone = useState("カジュアル"), tone = _tone[0], setTone = _tone[1];
  var _len = useState("中（2000〜3000字）"), len = _len[0], setLen = _len[1];
  var _aud = useState(""), aud = _aud[0], setAud = _aud[1];
  var _loading = useState(false), loading = _loading[0], setLoading = _loading[1];
  var _outline = useState(null), outline = _outline[0], setOL = _outline[1];
  var _raw = useState(""), raw = _raw[0], setRaw = _raw[1];
  var _titles = useState([]), titles = _titles[0], setTitles = _titles[1];
  var _sel = useState(""), sel = _sel[0], setSel = _sel[1];
  var _tags = useState([]), tags = _tags[0], setTags = _tags[1];
  var _copied = useState(""), copied = _copied[0], setC = _copied[1];
  var _err = useState(""), err = _err[0], setErr = _err[1];
  var _paid = useState(false), paid = _paid[0], setPaid = _paid[1];
  var _price = useState("500"), price = _price[0], setPrice = _price[1];
  var _pidx = useState(2), pidx = _pidx[0], setPidx = _pidx[1];
  var _iStyle = useState("写真風"), iStyle = _iStyle[0], setIS = _iStyle[1];
  var _iAsp = useState("16:9"), iAsp = _iAsp[0], setIA = _iAsp[1];
  var _eyecatch = useState(""), eyecatch = _eyecatch[0], setEyecatch = _eyecatch[1];
  var _arts = useState([]), arts = _arts[0], setArts = _arts[1];
  var _series = useState([]), series = _series[0], setSeries = _series[1];
  var _selSr = useState(null), selSr = _selSr[0], setSelSr = _selSr[1];
  var _newSr = useState(""), newSr = _newSr[0], setNewSr = _newSr[1];
  var _showNS = useState(false), showNS = _showNS[0], setShowNS = _showNS[1];
  var _viewArt = useState(null), viewArt = _viewArt[0], setViewArt = _viewArt[1];
  var _forSr = useState(null), forSr = _forSr[0], setForSr = _forSr[1];
  var _conn = useState(""), conn = _conn[0], setConn = _conn[1];
  var _refs = useState([]), refs = _refs[0], setRefs = _refs[1];
  var _newRef = useState({ title: "", url: "" }), newRef = _newRef[0], setNewRef = _newRef[1];
  var _truncWarn = useState(false), truncWarn = _truncWarn[0], setTruncWarn = _truncWarn[1];
  var _loadMsg = useState(""), loadMsg = _loadMsg[0], setLoadMsg = _loadMsg[1];
  var _userInst = useState(""), userInst = _userInst[0], setUserInst = _userInst[1];
  var _editMode = useState(false), editMode = _editMode[0], setEditMode = _editMode[1];
  var _editText = useState(""), editText = _editText[0], setEditText = _editText[1];
  var _editNote = useState(""), editNote = _editNote[0], setEditNote = _editNote[1];
  var _editTags = useState(false), editTags = _editTags[0], setEditTags = _editTags[1];
  var _tagInput = useState(""), tagInput = _tagInput[0], setTagInput = _tagInput[1];
  var _dbStatus = useState("idle"), dbStatus = _dbStatus[0], setDbStatus = _dbStatus[1];
  var _editId = useState(null), editId = _editId[0], setEditId = _editId[1];

  // Import states
  var _impView = useState("select"), impView = _impView[0], setImpView = _impView[1];
  var _impUrl = useState(""), impUrl = _impUrl[0], setImpUrl = _impUrl[1];
  var _impUser = useState(""), impUser = _impUser[0], setImpUser = _impUser[1];
  var _impList = useState([]), impList = _impList[0], setImpList = _impList[1];
  var _impSelected = useState([]), impSelected = _impSelected[0], setImpSelected = _impSelected[1];
  var _impLoading = useState(false), impLoading = _impLoading[0], setImpLoading = _impLoading[1];
  var _impErr = useState(""), impErr = _impErr[0], setImpErr = _impErr[1];
  var _impPreview = useState(null), impPreview = _impPreview[0], setImpPreview = _impPreview[1];

  var init = useRef(false);

  useEffect(function () {
    if (init.current) return;
    init.current = true;
    if (!supabase) { setErr("Supabaseが未設定です。.env.localを確認してください。"); return; }
    (async function () {
      try {
        var { data: artData } = await supabase.from("articles").select("*").order("created_at", { ascending: false });
        var { data: srData } = await supabase.from("series").select("*").order("created_at", { ascending: false });
        setArts(artData || []);
        setSeries(srData || []);
      } catch (e) { setErr("DB読み込み失敗: " + e.message); }
    })();
  }, []);

  function cc(t, l) { doCopy(t, setC, l); }

  function getSrInfo() {
    if (!forSr) return null;
    var s = series.find(function (x) { return x.id === forSr; });
    if (!s) return null;
    return { sr: s, isFirst: arts.filter(function(a){ return a.series_id === forSr; }).length === 0, num: arts.filter(function(a){ return a.series_id === forSr; }).length + 1 };
  }

  function makeNBPrompt(desc, heading) {
    var styles = { "写真風": "photorealistic, high resolution", "イラスト風": "digital illustration, vibrant", "フラットデザイン": "flat design, modern", "水彩画風": "watercolor, soft colors", "アニメ風": "anime style, cel-shaded", "ミニマル": "minimalist, clean" };
    var aspects = { "16:9": "landscape 16:9", "1:1": "square 1:1", "9:16": "portrait 9:16" };
    return desc + ". " + (styles[iStyle] || "photorealistic") + ". " + (aspects[iAsp] || "landscape 16:9") + ". Japanese aesthetic. If person: Japanese. For " + heading + ". No text, no watermark.";
  }

  function makeEyecatch(title, themeText) {
    var styles = { "写真風": "photorealistic, cinematic", "イラスト風": "illustration, vibrant", "フラットデザイン": "flat design", "水彩画風": "watercolor", "アニメ風": "anime style", "ミニマル": "minimalist" };
    return "Eye-catching hero: " + title + ". " + themeText + ". " + (styles[iStyle] || "photorealistic") + ". 16:9, hero for blog. If person: Japanese. No text.";
  }

  function buildSeriesContext() {
    if (!forSr) return "";
    var prevArts = arts.filter(function(a){ return a.series_id === forSr; }).sort(function(a,b){ return new Date(a.created_at) - new Date(b.created_at); });
    if (!prevArts.length) return "\nこれはシリーズの第1回（導入回）です。読者を惹きつける導入を書き、次回への期待を持たせてください。";
    var ctx = "\n\n【シリーズ情報 - 重要】\nこれはシリーズの第" + (prevArts.length + 1) + "回です。前回までの流れを踏まえ、自然な続きとして書いてください。\n";
    prevArts.slice(-3).forEach(function(a, i) {
      var summary = a.raw ? a.raw.slice(0, 600) : "";
      ctx += "\n--- 第" + (prevArts.length - 3 + i + 1) + "回: " + a.title + " ---\n";
      ctx += "冒頭概要: " + summary.split("\n").slice(0, 5).join(" ").slice(0, 200) + "\n";
    });
    ctx += "\n【ストーリー継続のルール】\n1. 前回の結論やまとめを受けて、自然に今回のテーマに繋げる\n2. 読者が前回から成長・進展を感じられる構成にする\n";
    return ctx;
  }

  function buildSeriesLinks() {
    if (!forSr) return "";
    var sr = series.find(function (x) { return x.id === forSr; });
    if (!sr) return "";
    var sa = arts.filter(function(a){ return a.series_id === forSr; }).sort(function(a,b){ return new Date(a.created_at) - new Date(b.created_at); });
    if (!sa.length) return "\n\n---\n\nシリーズ「" + sr.name + "」第1回です。";
    var links = sa.map(function (a, i) { return "- 第" + (i + 1) + "回: " + a.title; }).join("\n");
    return "\n\n---\n\nシリーズ「" + sr.name + "」\n" + links + "\n- 第" + (sa.length + 1) + "回: 本記事";
  }

  function buildRefLinks() {
    if (!refs.length) return "";
    return "\n\n---\n\n参考文献\n" + refs.map(function (r, i) { return (i + 1) + ". [" + r.title + "](" + r.url + ")"; }).join("\n");
  }

  async function genOL() {
    setLoading(true); setErr("");
    try {
      var seriesCtx = buildSeriesContext();
      var pr = paid ? "\n有料記事として構成。各sectionにisFreeを付与。" : "";
      var iff = paid ? ',"isFree":true' : "";
      var prompt = "あなたはnote.comのプロ記事構成作家です。以下の情報から記事構成をJSON形式で出力してください。\n\nテーマ: " + theme + "\nキーワード: " + (kw || "なし") + "\nトーン: " + tone + "\n想定読者: " + (aud || "一般") + "\n文字数: " + len + seriesCtx + pr;
      if (userInst.trim()) prompt += "\n\n【ユーザーからの追加指示】\n" + userInst;
      prompt += '\n\n【出力JSON形式（厳守）】\n{"titles":["タイトル1","タイトル2","タイトル3"],"sections":[{"heading":"見出し","level":"h2","summary":"内容概要","hasImage":true,"imageDesc":"ENGLISH description"' + iff + ',"subheadings":[]}],"hashtags":["タグ1","タグ2","タグ3","タグ4","タグ5","タグ6","タグ7","タグ8"],"seoDescription":"SEO説明文"}';

      var result = await callApi(prompt, "note.com記事構成作家。純粋なJSONのみ出力。{で始まり}で終わるJSONのみ。", 4000);
      var p = safeJSON(result.text, theme);
      setOL(p); setTitles(p.titles); setSel(p.titles[0]); setTags(p.hashtags);
      if (paid && p.paidConfig) { if (p.paidConfig.recommendedPrice) setPrice(String(p.paidConfig.recommendedPrice)); }
      setEyecatch(makeEyecatch(p.titles[0], p.seoDescription || theme));
      setStep(1);
    } catch (e) { setErr("構成生成失敗: " + e.message); }
    setLoading(false);
  }

  async function genArt() {
    setLoading(true); setErr(""); setTruncWarn(false); setLoadMsg("⏳ 記事を生成中...");
    try {
      var secStr = outline.sections.map(function (s, i) {
        var t = (i + 1) + ". [h2] " + s.heading + ": " + s.summary + (s.hasImage ? " [画像あり]" : "");
        if (s.hasImage && s.imageDesc) t += "\n[NanoBanana]: " + makeNBPrompt(s.imageDesc, s.heading);
        if (s.subheadings) s.subheadings.forEach(function (sub) { t += "\n  - [h3] " + sub.heading + ": " + sub.summary; });
        return t;
      }).join("\n");
      var seriesCtx = buildSeriesContext();
      var pi = paid ? "\n有料記事（" + price + "円）。セクション" + (pidx + 1) + "前に「💰 ここから先は有料部分です」挿入" : "";
      var prompt = "以下の構成でnote.com記事を日本語で執筆。\n\nタイトル: " + sel + "\nテーマ: " + theme + "\nキーワード: " + kw + "\nトーン: " + tone + "\n読者: " + (aud || "一般") + "\n文字数: " + len + "\n\n構成:\n" + secStr + seriesCtx + pi;
      if (userInst.trim()) prompt += "\n\n【ユーザーからの追加指示】\n" + userInst;
      prompt += "\n\n【執筆ルール】\n1. h2=「## 」h3=「### 」使用。h1不使用\n2. タイトルを本文に含めない。## から開始\n3. 画像箇所: 📷 NanoBanana prompt:\n「English prompt」\n4. 段落間空行\n5. **太字**、>引用、-箇条書き使用\n6. 必ず「## まとめ」で完結\n7. 指定文字数を満たすこと";

      var sysPrompt = "note.comプロライター。日本語で記事執筆。タイトルは本文に含めない。NanoBananaプロンプトは英語。文字数厳守。必ず最後まで書き切る。";
      var tokens = TOKEN_MAP[len] || 8000;
      var result = await callApi(prompt, sysPrompt, tokens);
      var fullText = result.text;
      var attempt = 0;
      while (result.truncated && attempt < MAX_CONTINUES) {
        attempt++;
        setLoadMsg("⏳ 続き生成中...（" + attempt + "/" + MAX_CONTINUES + "）");
        result = await callApi(null, sysPrompt, CONT_TOKENS, [
          { role: "user", content: prompt },
          { role: "assistant", content: fullText },
          { role: "user", content: "中断箇所から続きを。既出部分は繰り返さず。「## まとめ」で完結。" }
        ]);
        fullText += "\n" + result.text.replace(/^\n+/, "");
      }
      if (result.truncated) setTruncWarn(true);

      var body = fullText.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
      var lines = body.split("\n"); var s2 = 0;
      for (var i = 0; i < Math.min(lines.length, 5); i++) {
        if (lines[i].trim().indexOf("## ") === 0) { s2 = i; break; }
        if (lines[i].charAt(0) !== "#") { s2 = i; break; }
      }
      body = lines.slice(s2).join("\n").replace(/^\n+/, "");
      if (forSr && body.indexOf("シリーズ") === -1) body += buildSeriesLinks();
      if (refs.length > 0 && body.indexOf("参考文献") === -1) body += buildRefLinks();
      setRaw(body); setStep(2); setEditMode(false);
    } catch (e) { setErr("記事生成失敗: " + e.message); }
    setLoading(false); setLoadMsg("");
  }

  async function regenFromEdit() {
    setLoading(true); setErr(""); setLoadMsg("⏳ 編集を元に再生成中...");
    try {
      var seriesCtx = buildSeriesContext();
      var prompt = "以下はユーザーが編集した記事原稿です。この原稿を元に、文章を整え、自然で読みやすいnote.com記事として再生成してください。\n\nタイトル: " + sel + "\nテーマ: " + theme + "\nトーン: " + tone + "\n読者: " + (aud || "一般") + seriesCtx;
      if (editNote.trim()) prompt += "\n\n【ユーザーからの指示・修正メモ】\n" + editNote;
      prompt += "\n\n【ユーザー編集済み原稿】\n" + editText;
      prompt += "\n\n【再生成ルール】\n1. ユーザーの追記・修正内容を最大限活かす\n2. 文章の流れを自然に整える\n3. 見出し構造（##, ###）を維持\n4. NanoBananaプロンプト部分はそのまま保持\n5. タイトルは本文に含めない\n6. 全体の一貫性を確保";

      var result = await callApi(prompt, "note.com記事エディター。ユーザー編集を活かしつつ文章を改善。タイトル非含有。", TOKEN_MAP[len] || 8000);
      var fullText = result.text;
      var attempt = 0;
      while (result.truncated && attempt < MAX_CONTINUES) {
        attempt++;
        setLoadMsg("⏳ 続き生成中...（" + attempt + "/" + MAX_CONTINUES + "）");
        result = await callApi(null, "記事エディター。続きを書く。", CONT_TOKENS, [
          { role: "user", content: prompt }, { role: "assistant", content: fullText },
          { role: "user", content: "中断箇所から続きを。「## まとめ」で完結。" }
        ]);
        fullText += "\n" + result.text.replace(/^\n+/, "");
      }
      var body = fullText.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
      var lines = body.split("\n"); var s2 = 0;
      for (var i = 0; i < Math.min(lines.length, 5); i++) {
        if (lines[i].trim().indexOf("## ") === 0) { s2 = i; break; }
        if (lines[i].charAt(0) !== "#" && lines[i].trim()) { s2 = i; break; }
      }
      body = lines.slice(s2).join("\n").replace(/^\n+/, "");
      setRaw(body); setEditMode(false); setEditNote("");
    } catch (e) { setErr("再生成失敗: " + e.message); }
    setLoading(false); setLoadMsg("");
  }

  async function continueArt() {
    setLoading(true); setErr(""); setLoadMsg("⏳ 続き生成中...");
    try {
      var result = await callApi(null, "note.comプロライター。続きを書く。", CONT_TOKENS, [
        { role: "user", content: "以下の途中記事の続きを。\nタイトル: " + sel + "\nテーマ: " + theme + "\nトーン: " + tone + "\n\n記事:\n" + raw.slice(-2000) },
        { role: "assistant", content: "承知しました。" },
        { role: "user", content: "中断直後から続きのみ。「## まとめ」で完結。" }
      ]);
      setRaw(function (p) { return p + "\n\n" + result.text.replace(/^\n+/, "").replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim(); });
      if (!result.truncated) setTruncWarn(false);
    } catch (e) { setErr("続き生成失敗: " + e.message); }
    setLoading(false); setLoadMsg("");
  }

  async function saveArt() {
    if (!supabase) { setErr("Supabaseが未設定"); return; }
    setDbStatus("saving");
    try {
      var artData = { title: sel, theme: theme, kw: kw, tone: tone, aud: aud, len: len, raw: raw, tags: tags, paid: paid, price: price, pidx: pidx, outline: outline, eyecatch: eyecatch, seo: (outline && outline.seoDescription) || "", userInst: userInst, series_id: forSr || null };

      if (editId) {
        // 既存記事を更新
        var { error: upErr } = await supabase.from("articles").update(artData).eq("id", editId);
        if (upErr) throw upErr;
        setArts(function(p){ return p.map(function(a){ return a.id === editId ? Object.assign({}, a, artData, { id: editId }) : a; }); });
        setEditId(null);
      } else {
        // 新規記事を作成
        var { data: newArt, error: insErr } = await supabase.from("articles").insert([artData]).select();
        if (insErr) throw insErr;
        if (newArt && newArt.length > 0) setArts(function(p){ return [newArt[0]].concat(p); });
      }

      // 参考文献を保存
      if (refs.length > 0 && newArt && newArt[0]) {
        var refData = refs.map(function(r){ return { article_id: newArt[0].id, title: r.title, url: r.url }; });
        await supabase.from("references").insert(refData);
      }

      setDbStatus("saved");
      setTimeout(function(){ setDbStatus("idle"); }, 2000);
      reset();
    } catch (e) { setErr("DB保存失敗: " + e.message); setDbStatus("error"); }
  }

  function delArt(id) {
    if (!supabase || !window.confirm("削除してもよろしいですか？")) return;
    (async function() {
      try {
        await supabase.from("articles").delete().eq("id", id);
        setArts(function (p) { return p.filter(function (a) { return a.id !== id; }); });
      } catch (e) { setErr("削除失敗: " + e.message); }
    })();
  }

  function mkSr() {
    if (!supabase || !newSr.trim()) return;
    (async function() {
      try {
        var { data: newS, error: e } = await supabase.from("series").insert([{ name: newSr.trim() }]).select();
        if (e) throw e;
        if (newS) setSeries(function (p) { return [newS[0]].concat(p); });
        setNewSr(""); setShowNS(false);
      } catch (e) { setErr("シリーズ作成失敗: " + e.message); }
    })();
  }

  function delSr(id) {
    if (!supabase || !window.confirm("削除してもよろしいですか？")) return;
    (async function() {
      try {
        await supabase.from("series").delete().eq("id", id);
        setSeries(function (p) { return p.filter(function (s) { return s.id !== id; }); });
        setArts(function (p) { return p.map(function (a) { return a.series_id === id ? Object.assign({}, a, { series_id: null }) : a; }); });
      } catch (e) { setErr("削除失敗: " + e.message); }
    })();
  }

  // Import functions
  async function importFromUrl() {
    setImpLoading(true); setImpErr("");
    try {
      var match = impUrl.match(/note\.com\/([^\/]+)\/n\/([a-zA-Z0-9]+)/);
      if (!match) throw new Error("URL形式が正しくありません");
      var key = match[2];
      var data = await fetchNoteArticle(key);
      setImpPreview(data);
      setImpView("preview");
    } catch (e) { setImpErr("記事取得失敗: " + e.message); }
    setImpLoading(false);
  }

  async function importFromUsername() {
    setImpLoading(true); setImpErr("");
    try {
      if (!impUser.trim()) throw new Error("ユーザー名を入力してください");
      var data = await fetchNoteUserArticles(impUser);
      setImpList(data.articles || []);
      setImpView("select");
    } catch (e) { setImpErr("ユーザー記事一覧取得失敗: " + e.message); }
    setImpLoading(false);
  }

  async function importSelected() {
    setImpLoading(true); setImpErr("");
    try {
      for (var i = 0; i < impSelected.length; i++) {
        var article = impList.find(function(a){ return a.key === impSelected[i]; });
        if (!article) continue;
        var data = await fetchNoteArticle(article.key);
        var artData = { title: data.title, theme: data.title, kw: data.tags ? data.tags.join(", ") : "", tone: "カジュアル", aud: "", len: "中（2000〜3000字）", raw: data.markdown || data.html || "", tags: data.tags || [], paid: false, price: "500", pidx: 2, outline: null, eyecatch: "", seo: data.description || "", userInst: "" };
        var { data: newArt, error: e } = await supabase.from("articles").insert([artData]).select();
        if (e) throw e;
      }
      setImpSelected([]); setImpList([]); setImpView("select"); setImpUrl(""); setImpUser("");
    } catch (e) { setImpErr("インポート失敗: " + e.message); }
    setImpLoading(false);
  }

  async function savePreviewed() {
    if (!supabase || !impPreview) return;
    setImpLoading(true); setImpErr("");
    try {
      var artData = { title: impPreview.title, theme: impPreview.title, kw: impPreview.tags ? impPreview.tags.join(", ") : "", tone: "カジュアル", aud: "", len: "中（2000〜3000字）", raw: impPreview.markdown || impPreview.html || "", tags: impPreview.tags || [], paid: false, price: "500", pidx: 2, outline: null, eyecatch: "", seo: impPreview.description || "", userInst: "" };
      var { error: e } = await supabase.from("articles").insert([artData]).select();
      if (e) throw e;
      setArts(function(p){ return [Object.assign({}, artData, { id: Math.random().toString() })].concat(p); });
      setImpPreview(null); setImpView("select"); setImpUrl("");
    } catch (e) { setImpErr("保存失敗: " + e.message); }
    setImpLoading(false);
  }

  function reset() {
    setStep(0); setOL(null); setRaw(""); setTitles([]); setSel(""); setTags([]); setErr(""); setTheme(""); setKw(""); setAud(""); setEyecatch(""); setRefs([]); setNewRef({ title: "", url: "" }); setPaid(false); setPrice("500"); setPidx(2); setForSr(null); setTruncWarn(false); setLoadMsg(""); setEditMode(false); setEditText(""); setEditNote(""); setEditTags(false); setTagInput(""); setUserInst(""); setEditId(null);
  }

  function loadArt(a) {
    setTheme(a.theme || ""); setKw(a.kw || ""); setAud(a.aud || ""); setTone(a.tone || "カジュアル"); setLen(a.len || "中（2000〜3000字）"); setPaid(!!a.paid); setPrice(a.price || "500"); setPidx(a.pidx || 2); setForSr(a.series_id || null); setIS(a.iStyle || "写真風"); setIA(a.iAsp || "16:9"); setRefs(a.refs || []); setOL(a.outline || null); setRaw(a.raw || ""); setSel(a.title || ""); setTitles((a.outline && a.outline.titles) || [a.title]); setTags(a.tags || []); setEyecatch(a.eyecatch || ""); setErr(""); setStep(a.raw ? 2 : a.outline ? 1 : 0); setView("edit"); setViewArt(null); setTruncWarn(false); setEditMode(false); setEditText(""); setEditNote(""); setUserInst(a.userInst || ""); setEditId(a.id || null);
  }

  function addRef() {
    if (!newRef.title.trim() || !newRef.url.trim()) return;
    setRefs(function (p) { return p.concat([Object.assign({}, newRef)]); }); setNewRef({ title: "", url: "" });
  }

  function startEdit() { setEditText(raw); setEditMode(true); setEditNote(""); }
  function cancelEdit() { setEditMode(false); setEditText(""); setEditNote(""); }
  function applyEditDirect() { setRaw(editText); setEditMode(false); setEditNote(""); }
  function startTagEdit() { setTagInput(tags.join(", ")); setEditTags(true); }
  function applyTagEdit() { setTags(tagInput.split(/[,、\s]+/).map(function(t){ return t.replace(/^#/, "").trim(); }).filter(Boolean)); setEditTags(false); }

  function renderBody(t) {
    var ls = t.split("\n"); var pd = false; var el = []; var i = 0;
    while (i < ls.length) {
      var l = ls[i].trim();
      if (l.indexOf("有料") !== -1 && (l.indexOf("💰") !== -1 || l.indexOf("★") !== -1)) { pd = true; el.push(<div key={i} style={{ background: "#fff3cd", border: "2px solid #f39c12", borderRadius: 8, padding: "10px 14px", margin: "12px 0", textAlign: "center", fontSize: 14, fontWeight: 700, color: "#e67e22" }}>🔒 有料部分</div>); i++; continue; }
      if (l.charAt(0) === "※" && (l.indexOf("画像") !== -1 || l.indexOf("挿入") !== -1)) { el.push(<div key={i} style={{ background: "#fff3e0", border: "1px dashed #ff9800", borderRadius: 6, padding: "6px 10px", margin: "4px 0", fontSize: 11, color: "#e65100", textAlign: "center" }}>{l}</div>); i++; continue; }
      if (l.indexOf("NanoBanana") !== -1 || l.indexOf("📷") !== -1) {
        var b = [l]; var j = i + 1;
        while (j < ls.length && ls[j].trim() && ls[j].trim().indexOf("##") !== 0 && ls[j].trim().charAt(0) !== "※") { b.push(ls[j].trim()); j++; }
        var m = b.join("\n").match(/[「『](.+?)[」』]/s); var pt = m ? m[1] : b.slice(1).join(" ");
        el.push(<div key={i} style={{ background: "#e8f5e9", border: "2px solid #66bb6a", borderRadius: 8, padding: "12px 14px", margin: "10px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#2e7d32" }}>🍌 画像</span>
            <button onClick={function () { cc(pt, "nb" + i); }} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid #66bb6a", background: copied === ("nb" + i) ? "#66bb6a" : "white", color: copied === ("nb" + i) ? "white" : "#2e7d32", fontSize: 10, cursor: "pointer" }}>{copied === ("nb" + i) ? "✓" : "コピー"}</button>
          </div>
          <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: 6, padding: "6px 8px", fontSize: 12, color: "#1b5e20", fontFamily: "monospace", wordBreak: "break-word" }}>{pt}</div>
        </div>);
        i = j; while (i < ls.length && (ls[i].trim() === "" || (ls[i].trim().charAt(0) === "※"))) i++; continue;
      }
      var z = pd ? { opacity: 0.85, borderLeft: "3px solid #f39c12", paddingLeft: 6 } : {};
      if (l.indexOf("### ") === 0) el.push(<h4 key={i} style={Object.assign({ fontSize: 14, fontWeight: 700, margin: "12px 0 4px", color: "#333", borderLeft: "3px solid #8DD6C9", paddingLeft: 8 }, z)}>{l.slice(4)}</h4>);
      else if (l.indexOf("## ") === 0) el.push(<h3 key={i} style={Object.assign({ fontSize: 16, fontWeight: 700, margin: "18px 0 6px", color: "#222", borderLeft: "4px solid #41C9B4", paddingLeft: 8 }, z)}>{l.slice(3)}</h3>);
      else if (l === "---") el.push(<hr key={i} style={{ border: "none", borderTop: "1px solid #e0e0e0", margin: "14px 0" }} />);
      else if (l.indexOf("> ") === 0) el.push(<blockquote key={i} style={Object.assign({ borderLeft: "3px solid #ccc", paddingLeft: 8, margin: "4px 0", color: "#666", fontStyle: "italic" }, z)}>{l.slice(2)}</blockquote>);
      else if (l.indexOf("- ") === 0) el.push(<div key={i} style={Object.assign({ paddingLeft: 12, margin: "2px 0" }, z)}>• {l.slice(2)}</div>);
      else if (/^\d+\.\s/.test(l)) el.push(<div key={i} style={Object.assign({ paddingLeft: 12, margin: "2px 0" }, z)}>{l}</div>);
      else if (!l) el.push(<br key={i} />);
      else { var h = l.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); el.push(<p key={i} style={Object.assign({ margin: "4px 0" }, z)} dangerouslySetInnerHTML={{ __html: h }} />); }
      i++;
    }
    return el;
  }

  var srInfo = getSrInfo();
  var canRef = newRef.title.trim() && newRef.url.trim();
  var nbList = extractNB(raw);
  var dbStatusColor = dbStatus === "saved" ? "#4caf50" : dbStatus === "saving" ? "#ff9800" : dbStatus === "error" ? "#f44336" : "#999";

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f5f7fa,#e8f0fe)", fontFamily: "'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg,#41C9B4,#2BA89D)", padding: "14px 18px", color: "white" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, cursor: "pointer" }} onClick={function () { setView("edit"); setViewArt(null); }}>📝 note記事ジェネレーター</h1>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {[["edit", "✏️"], ["lib", "📚" + arts.length], ["sr", "📖" + series.length], ["imp", "📥"]].map(function (item) {
              return <button key={item[0]} onClick={function () { setView(item[0]); setViewArt(null); }} style={{ padding: "5px 10px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.4)", background: view === item[0] ? "rgba(255,255,255,0.2)" : "transparent", color: "white", fontSize: 11, cursor: "pointer" }}>{item[1]}</button>;
            })}
            <div style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: dbStatusColor, color: "white" }}>⚫ {dbStatus}</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "12px 18px 36px" }}>
        {err && <div style={{ background: "#fee", border: "1px solid #fcc", borderRadius: 7, padding: "8px 12px", marginBottom: 12, color: "#c00", fontSize: 12 }}>⚠️ {err}</div>}

        {/* IMPORT */}
        {view === "imp" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>📥 インポート</h2>
          {impErr && <div style={{ background: "#fee", border: "1px solid #fcc", borderRadius: 7, padding: "8px 12px", color: "#c00", fontSize: 12 }}>⚠️ {impErr}</div>}

          {impView === "select" && <div style={stCard}>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              <button onClick={function() { setImpView("url"); setImpUrl(""); }} style={{ flex: 1, padding: "8px 12px", borderRadius: 7, border: "1px solid #42a5f5", background: "white", color: "#1565c0", fontSize: 12, cursor: "pointer" }}>🔗 URLから</button>
              <button onClick={function() { setImpView("user"); setImpUser(""); }} style={{ flex: 1, padding: "8px 12px", borderRadius: 7, border: "1px solid #42a5f5", background: "white", color: "#1565c0", fontSize: 12, cursor: "pointer" }}>👤 ユーザーから</button>
            </div>
          </div>}

          {impView === "url" && <div style={stCard}>
            <label style={stLabel}>note記事URL</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={impUrl} onChange={function(e){ setImpUrl(e.target.value); }} placeholder="https://note.com/username/n/xxxxxxx" style={Object.assign({}, stInput, { flex: 1 })} />
              <button onClick={importFromUrl} disabled={impLoading || !impUrl} style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: impLoading ? "#ccc" : "#42a5f5", color: "white", fontSize: 12, cursor: impLoading ? "not-allowed" : "pointer" }}>{impLoading ? "取得中..." : "取得"}</button>
            </div>
            <button onClick={function(){ setImpView("select"); }} style={{ marginTop: 10, padding: "6px 14px", borderRadius: 7, border: "1px solid #ddd", background: "white", fontSize: 12, cursor: "pointer" }}>← 戻る</button>
          </div>}

          {impView === "user" && <div style={stCard}>
            <label style={stLabel}>noteユーザー名</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={impUser} onChange={function(e){ setImpUser(e.target.value); }} placeholder="example_user" style={Object.assign({}, stInput, { flex: 1 })} />
              <button onClick={importFromUsername} disabled={impLoading || !impUser} style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: impLoading ? "#ccc" : "#42a5f5", color: "white", fontSize: 12, cursor: impLoading ? "not-allowed" : "pointer" }}>{impLoading ? "取得中..." : "取得"}</button>
            </div>
            <button onClick={function(){ setImpView("select"); }} style={{ marginTop: 10, padding: "6px 14px", borderRadius: 7, border: "1px solid #ddd", background: "white", fontSize: 12, cursor: "pointer" }}>← 戻る</button>
          </div>}

          {impView === "preview" && impPreview && <div style={stCard}>
            <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>{impPreview.title}</h3>
            <p style={{ fontSize: 12, color: "#666", margin: "0 0 10px" }}>{impPreview.description}</p>
            <div style={{ background: "#f5f5f5", borderRadius: 6, padding: 8, fontSize: 11, maxHeight: 200, overflowY: "auto", marginBottom: 10 }}>{impPreview.markdown ? impPreview.markdown.slice(0, 500) : impPreview.html ? impPreview.html.slice(0, 500) : "本文なし"}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={function(){ setImpPreview(null); setImpView("select"); }} style={{ flex: 1, padding: "6px 12px", borderRadius: 7, border: "1px solid #ddd", background: "white", fontSize: 12, cursor: "pointer" }}>キャンセル</button>
              <button onClick={savePreviewed} disabled={impLoading} style={{ flex: 1, padding: "6px 12px", borderRadius: 7, border: "none", background: impLoading ? "#ccc" : "#4caf50", color: "white", fontSize: 12, fontWeight: 600, cursor: impLoading ? "not-allowed" : "pointer" }}>{impLoading ? "保存中..." : "💾 DBに保存"}</button>
            </div>
          </div>}

          {impView === "select" && impList.length > 0 && <div style={stCard}>
            <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>記事を選択</h3>
            {impList.map(function(a, i){ return <label key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: i < impList.length - 1 ? "1px solid #f0f0f0" : "none", cursor: "pointer" }}>
              <input type="checkbox" checked={impSelected.includes(a.key)} onChange={function(){ setImpSelected(function(p){ return p.includes(a.key) ? p.filter(function(x){ return x !== a.key; }) : [a.key].concat(p); }); }} style={{ accentColor: "#42a5f5" }} />
              <span style={{ flex: 1, fontSize: 12 }}>{a.title}</span>
            </label>; })}
            <button onClick={importSelected} disabled={impLoading || impSelected.length === 0} style={{ marginTop: 10, width: "100%", padding: "6px 12px", borderRadius: 7, border: "none", background: impLoading ? "#ccc" : "#4caf50", color: "white", fontSize: 12, fontWeight: 600, cursor: impLoading ? "not-allowed" : "pointer" }}>{impLoading ? "インポート中..." : "✅ 選択をインポート"}</button>
          </div>}
        </div>}

        {/* LIBRARY */}
        {view === "lib" && !viewArt && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>📚 記事ライブラリ</h2>
            <button onClick={function () { reset(); setView("edit"); }} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg,#41C9B4,#2BA89D)", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ 新規</button>
          </div>
          {!arts.length ? <div style={stCard}><p style={{ textAlign: "center", color: "#999", margin: 0, fontSize: 13 }}>記事なし</p></div> : arts.map(function (a) {
            var sr = a.series_id ? series.find(function(s){ return s.id === a.series_id; }) : null;
            return <div key={a.id} style={Object.assign({}, stCard, { cursor: "pointer" })} onClick={function () { setViewArt(a); }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{a.title}</h3>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: 9, color: "#999" }}>{new Date(a.created_at).toLocaleDateString("ja-JP")}</span>
                    {sr && <span style={{ fontSize: 9, background: "#ede7f6", color: "#7c4dff", padding: "1px 6px", borderRadius: 8 }}>📖 {sr.name}</span>}
                    <span style={{ fontSize: 9, color: "#666", background: "#f0f0f0", padding: "1px 4px", borderRadius: 3 }}>ID: {a.id.slice(0, 8)}</span>
                  </div>
                </div>
                <button onClick={function (e) { e.stopPropagation(); delArt(a.id); }} style={{ padding: "3px 6px", borderRadius: 3, border: "1px solid #ddd", background: "white", color: "#999", fontSize: 10, cursor: "pointer" }}>削除</button>
              </div>
            </div>;
          })}
        </div>}

        {/* ARTICLE DETAIL */}
        {view === "lib" && viewArt && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={function () { setViewArt(null); }} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #ddd", background: "white", fontSize: 12, cursor: "pointer" }}>← 戻る</button>
            <button onClick={function () { loadArt(viewArt); }} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#7c4dff", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✏️ 再編集</button>
          </div>
          <div style={stCard}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><h2 style={{ fontSize: 15, margin: 0 }}>{viewArt.title}</h2><button onClick={function () { cc(viewArt.title, "dt"); }} style={btnCopy(copied === "dt")}>{copied === "dt" ? "✓" : "コピー"}</button></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>{(viewArt.tags || []).map(function (h, i) { return <span key={i} style={stTag}>#{h}</span>; })}</div>
          </div>
          {viewArt.eyecatch && <div style={Object.assign({}, stCard, { border: "2px solid #ff9800", background: "#fff8e1" })}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13, fontWeight: 700, color: "#e65100" }}>🖼️ アイキャッチ</span><button onClick={function () { cc(viewArt.eyecatch, "dec"); }} style={btnCopy(copied === "dec")}>{copied === "dec" ? "✓" : "コピー"}</button></div>
            <div style={{ background: "white", borderRadius: 6, padding: 8, fontSize: 12, color: "#bf360c", fontFamily: "monospace", wordBreak: "break-word" }}>{viewArt.eyecatch}</div>
          </div>}
          <div style={stCard}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 14, fontWeight: 700 }}>記事本文</span><button onClick={function () { cc(viewArt.raw, "da"); }} style={{ padding: "5px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg,#41C9B4,#2BA89D)", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{copied === "da" ? "✓コピー済" : "📋全文コピー"}</button></div>
            <div style={{ background: "#fafafa", borderRadius: 7, padding: 14, fontSize: 13, lineHeight: 1.7, maxHeight: 400, overflowY: "auto", border: "1px solid #eee" }}>{renderBody(viewArt.raw)}</div>
          </div>
        </div>}

        {/* SERIES */}
        {view === "sr" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><h2 style={{ fontSize: 16, margin: 0 }}>📖 シリーズ管理</h2><button onClick={function () { setShowNS(!showNS); }} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: "#7c4dff", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ 新規</button></div>
          {showNS && <div style={Object.assign({}, stCard, { border: "2px solid #7c4dff" })}><div style={{ display: "flex", gap: 6 }}><input value={newSr} onChange={function (e) { setNewSr(e.target.value); }} placeholder="シリーズ名" style={Object.assign({}, stInput, { flex: 1 })} onKeyDown={function (e) { if (e.key === "Enter") mkSr(); }} /><button onClick={mkSr} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: "#7c4dff", color: "white", fontSize: 12, cursor: "pointer" }}>作成</button></div></div>}
          {!series.length ? <div style={stCard}><p style={{ textAlign: "center", color: "#999", margin: 0 }}>シリーズなし</p></div> : series.map(function (sr) {
            var sArts = arts.filter(function(a){ return a.series_id === sr.id; });
            var isOpen = selSr === sr.id;
            return <div key={sr.id} style={Object.assign({}, stCard, isOpen ? { border: "2px solid #7c4dff" } : {})}>
              <div style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }} onClick={function () { setSelSr(isOpen ? null : sr.id); }}>
                <div><h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>📖 {sr.name}</h3><p style={{ fontSize: 11, color: "#888", margin: 0 }}>{sArts.length}記事</p></div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={function (e) { e.stopPropagation(); reset(); setForSr(sr.id); setView("edit"); }} style={{ padding: "4px 10px", borderRadius: 5, border: "none", background: "linear-gradient(135deg,#41C9B4,#2BA89D)", color: "white", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{!sArts.length ? "最初の記事" : "+ 次の記事"}</button>
                  <button onClick={function (e) { e.stopPropagation(); delSr(sr.id); }} style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #ddd", background: "white", color: "#999", fontSize: 10, cursor: "pointer" }}>削除</button>
                </div>
              </div>
              {isOpen && <div style={{ marginTop: 10, borderTop: "1px solid #eee", paddingTop: 10 }}>
                {!sArts.length ? <p style={{ fontSize: 12, color: "#999", textAlign: "center" }}>記事なし</p> : sArts.map(function (a, idx) {
                  return <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: idx < sArts.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#7c4dff", minWidth: 28 }}>#{idx + 1}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{a.title}</span>
                    <span style={{ fontSize: 9, color: "#999" }}>{new Date(a.created_at).toLocaleDateString("ja-JP")}</span>
                  </div>;
                })}
              </div>}
            </div>;
          })}
        </div>}

        {/* EDITOR */}
        {view === "edit" && <>
          <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 12 }}>
            {STEPS.map(function (s, i) {
              return <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: i <= step ? "#41C9B4" : "#ddd", color: i <= step ? "white" : "#999" }}>{i + 1}</div>
                <span style={{ fontSize: 11, color: i <= step ? "#333" : "#999", fontWeight: i === step ? 700 : 400 }}>{s}</span>
                {i < 2 && <div style={{ flex: 1, height: 2, background: i < step ? "#41C9B4" : "#ddd" }} />}
              </div>;
            })}
          </div>

          {forSr && srInfo && <div style={{ background: "#ede7f6", borderRadius: 7, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span>📖</span><span style={{ color: "#4a148c", fontWeight: 700 }}>シリーズ「{srInfo.sr.name}」第{srInfo.num}回{srInfo.isFirst ? "（初回）" : ""}</span>
              <button onClick={function () { setForSr(null); }} style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #ce93d8", background: "white", color: "#7c4dff", fontSize: 10, cursor: "pointer", marginLeft: "auto" }}>解除</button>
            </div>
          </div>}

          {/* STEP 0 */}
          {step === 0 && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={stCard}>
              <h2 style={{ fontSize: 15, margin: "0 0 14px" }}>テーマ・設定</h2>
              <div style={{ marginBottom: 10 }}><label style={stLabel}>テーマ *</label><input value={theme} onChange={function (e) { setTheme(e.target.value); }} placeholder="例: AIを使った副業の始め方" style={stInput} /></div>
              <div style={{ marginBottom: 10 }}><label style={stLabel}>キーワード</label><input value={kw} onChange={function (e) { setKw(e.target.value); }} placeholder="カンマ区切り" style={stInput} /></div>
              <div style={{ marginBottom: 10 }}><label style={stLabel}>想定読者</label><input value={aud} onChange={function (e) { setAud(e.target.value); }} placeholder="例: 20〜30代の会社員" style={stInput} /></div>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1 }}><label style={stLabel}>トーン</label><select value={tone} onChange={function (e) { setTone(e.target.value); }} style={stSel}>{TONES.map(function (t) { return <option key={t}>{t}</option>; })}</select></div>
                <div style={{ flex: 1 }}><label style={stLabel}>文字数</label><select value={len} onChange={function (e) { setLen(e.target.value); }} style={stSel}>{LENS.map(function (v) { return <option key={v} value={v}>{v}</option>; })}</select></div>
              </div>
            </div>
            <div style={Object.assign({}, stCard, { border: "2px solid #42a5f5" })}>
              <h3 style={{ fontSize: 14, margin: "0 0 8px", color: "#1565c0" }}>📚 参考文献</h3>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input value={newRef.title} onChange={function (e) { setNewRef(function (p) { return Object.assign({}, p, { title: e.target.value }); }); }} placeholder="タイトル" style={Object.assign({}, stInput, { flex: 1 })} />
                <input value={newRef.url} onChange={function (e) { setNewRef(function (p) { return Object.assign({}, p, { url: e.target.value }); }); }} placeholder="URL" style={Object.assign({}, stInput, { flex: 1.5 })} onKeyDown={function (e) { if (e.key === "Enter") addRef(); }} />
                <button onClick={addRef} disabled={!canRef} style={{ padding: "6px 12px", borderRadius: 7, border: "none", background: canRef ? "#42a5f5" : "#ccc", color: "white", fontSize: 12, cursor: canRef ? "pointer" : "not-allowed" }}>追加</button>
              </div>
              {refs.length > 0 && <div>{refs.map(function (r, idx) { return <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}><span style={{ fontSize: 11, fontWeight: 700 }}>{idx + 1}.</span><span style={{ flex: 1, fontSize: 12 }}>{r.title}</span><button onClick={function () { var ci = idx; setRefs(function(p){ return p.filter(function(_,j){ return j !== ci; }); }); }} style={{ padding: "1px 4px", border: "1px solid #ddd", borderRadius: 3, background: "white", color: "#e53935", fontSize: 10, cursor: "pointer" }}>×</button></div>; })}</div>}
            </div>
            <div style={Object.assign({}, stCard, { border: "2px solid #66bb6a" })}>
              <h3 style={{ fontSize: 14, margin: "0 0 10px", color: "#2e7d32" }}>🍌 画像設定</h3>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}><label style={stLabel}>スタイル</label><select value={iStyle} onChange={function (e) { setIS(e.target.value); }} style={stSel}>{IMGS.map(function (s) { return <option key={s}>{s}</option>; })}</select></div>
                <div style={{ flex: 1 }}><label style={stLabel}>比率</label><select value={iAsp} onChange={function (e) { setIA(e.target.value); }} style={stSel}><option value="16:9">16:9</option><option value="1:1">1:1</option><option value="9:16">9:16</option></select></div>
              </div>
            </div>
            <div style={Object.assign({}, stCard, paid ? { border: "2px solid #f39c12" } : {})}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 14, margin: 0 }}>💰 有料記事</h3>
                <div onClick={function () { setPaid(!paid); }} style={{ width: 44, height: 24, borderRadius: 12, background: paid ? "#f39c12" : "#ccc", cursor: "pointer", padding: 2, position: "relative" }}><div style={{ width: 20, height: 20, borderRadius: 10, background: "white", position: "absolute", top: 2, left: paid ? 22 : 2, transition: "all 0.3s" }} /></div>
              </div>
            </div>
            <div style={Object.assign({}, stCard, { border: userInst.trim() ? "2px solid #ab47bc" : "1px solid #e0e0e0" })}>
              <h3 style={{ fontSize: 14, margin: "0 0 8px", color: "#7b1fa2" }}>💬 記事への指示・リクエスト</h3>
              <p style={{ fontSize: 11, color: "#888", margin: "0 0 8px" }}>AIへの自由な指示を書いてください。構成と記事生成の両方に反映されます。</p>
              <textarea value={userInst} onChange={function(e){ setUserInst(e.target.value); }} placeholder={"例:\n・AとBの違いについても触れてほしい\n・実体験ベースで書いてほしい\n・初心者にもわかりやすく、専門用語には解説をつけて"} style={{ width: "100%", minHeight: 100, padding: "10px 12px", borderRadius: 7, border: "1px solid #ce93d8", fontSize: 13, lineHeight: 1.6, boxSizing: "border-box", outline: "none", resize: "vertical", background: "#faf5ff", fontFamily: "inherit" }} />
            </div>
            <button onClick={genOL} disabled={!theme || loading} style={btnPrimary(!!theme && !loading)}>{loading ? (loadMsg || "⏳ 構成生成中...") : "構成を生成する →"}</button>
          </div>}

          {/* STEP 1 */}
          {step === 1 && outline && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={stCard}>
              <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>タイトル選択</h2>
              {titles.map(function (t, i) { return <label key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 7, marginBottom: 5, border: sel === t ? "2px solid #41C9B4" : "1px solid #eee", background: sel === t ? "#f0faf8" : "white", cursor: "pointer", fontSize: 13 }}><input type="radio" name="t" checked={sel === t} onChange={function () { setSel(t); }} style={{ accentColor: "#41C9B4" }} />{t}</label>; })}
              <input value={sel} onChange={function (e) { setSel(e.target.value); }} placeholder="カスタムタイトル" style={Object.assign({}, stInput, { marginTop: 4, fontSize: 12 })} />
            </div>
            {eyecatch && <div style={Object.assign({}, stCard, { border: "2px solid #ff9800", background: "#fff8e1" })}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13, fontWeight: 700, color: "#e65100" }}>🖼️ アイキャッチ</span><button onClick={function () { cc(eyecatch, "ec"); }} style={btnCopy(copied === "ec")}>{copied === "ec" ? "✓" : "コピー"}</button></div>
              <div style={{ background: "white", borderRadius: 6, padding: 8, fontSize: 12, color: "#bf360c", fontFamily: "monospace", wordBreak: "break-word" }}>{eyecatch}</div>
            </div>}
            {paid && <div style={Object.assign({}, stCard, { border: "2px solid #f39c12", background: "#fff8e1" })}>
              <h3 style={{ fontSize: 14, margin: "0 0 10px", color: "#e65100" }}>💰 有料設定</h3>
              <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1 }}><label style={stLabel}>価格（円）</label><input type="number" value={price} onChange={function (e) { setPrice(e.target.value); }} style={stInput} step="100" min="100" /></div>
                <div style={{ flex: 1 }}><label style={stLabel}>無料セクション数</label><input type="number" value={pidx} onChange={function (e) { setPidx(Math.max(1, parseInt(e.target.value) || 1)); }} style={stInput} min="1" /></div>
              </div>
            </div>}
            <div style={stCard}>
              <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>見出し構成</h2>
              {outline.sections.map(function (sec, i) {
                return <div key={i} style={{ padding: "8px 0", borderBottom: i < outline.sections.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ background: "#41C9B4", color: "white", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>H2</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{sec.heading}</span>
                    {sec.hasImage && <span style={{ fontSize: 10 }}>🍌</span>}
                  </div>
                  <p style={{ margin: "2px 0 0 30px", fontSize: 11, color: "#777" }}>{sec.summary}</p>
                </div>;
              })}
            </div>
            <div style={stCard}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, fontWeight: 600 }}>ハッシュタグ</span><button onClick={function () { cc(tags.map(function (h) { return "#" + h; }).join(" "), "tg"); }} style={btnCopy(copied === "tg")}>{copied === "tg" ? "✓" : "コピー"}</button></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>{tags.map(function (h, i) { return <span key={i} style={stTag}>#{h}</span>; })}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={function () { setStep(0); }} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd", background: "white", fontSize: 13, cursor: "pointer" }}>← 戻る</button>
              <button onClick={genArt} disabled={loading} style={Object.assign({ flex: 2 }, btnPrimary(!loading))}>{loading ? (loadMsg || "⏳ 生成中...") : "記事を生成 →"}</button>
            </div>
          </div>}

          {/* STEP 2 */}
          {step === 2 && raw && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={stCard}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><h2 style={{ fontSize: 15, margin: 0 }}>{sel}</h2><button onClick={function () { cc(sel, "tt"); }} style={btnCopy(copied === "tt")}>{copied === "tt" ? "✓" : "コピー"}</button></div>
            </div>

            {truncWarn && <div style={{ background: "#fff3cd", border: "2px solid #f39c12", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#e65100" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>⚠️ 記事が途中で終了しています</span>
                <button onClick={continueArt} disabled={loading} style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: loading ? "#ccc" : "#f39c12", color: "white", fontSize: 12, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>{loading ? (loadMsg || "⏳") : "🔄 続きを生成"}</button>
              </div>
            </div>}

            <div style={{ background: "#fff8e1", border: "2px solid #ff9800", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#f57f17" }}>⚠️ AI生成テンプレート — 画像{countImg(raw)}箇所はプロンプトのみ。</div>

            {eyecatch && <div style={Object.assign({}, stCard, { border: "2px solid #ff9800", background: "#fff8e1" })}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13, fontWeight: 700, color: "#e65100" }}>🖼️ アイキャッチ</span><button onClick={function () { cc(eyecatch, "ec2"); }} style={btnCopy(copied === "ec2")}>{copied === "ec2" ? "✓" : "コピー"}</button></div>
              <div style={{ background: "white", borderRadius: 6, padding: 8, fontSize: 11, color: "#bf360c", fontFamily: "monospace", wordBreak: "break-word" }}>{eyecatch}</div>
            </div>}

            {nbList.length > 0 && <div style={Object.assign({}, stCard, { border: "2px solid #66bb6a" })}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13, fontWeight: 700, color: "#2e7d32" }}>🍌 NanoBanana ({nbList.length}枚)</span><button onClick={function () { cc(nbList.join("\n\n---\n\n"), "anb"); }} style={btnCopy(copied === "anb")}>{copied === "anb" ? "✓" : "全コピー"}</button></div>
              {nbList.map(function (p, i) {
                var k = "nl" + i;
                return <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4, background: "#f1f8e9", borderRadius: 5, padding: "6px 8px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#2e7d32" }}>#{i + 1}</span>
                  <div style={{ flex: 1, fontSize: 11, color: "#1b5e20", wordBreak: "break-word" }}>{p}</div>
                  <button onClick={function () { cc(p, k); }} style={{ padding: "1px 5px", borderRadius: 3, border: "1px solid #a5d6a7", background: copied === k ? "#66bb6a" : "white", color: copied === k ? "white" : "#2e7d32", fontSize: 9, cursor: "pointer" }}>{copied === k ? "✓" : "コピー"}</button>
                </div>;
              })}
            </div>}

            <div style={stCard}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>記事本文</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {!editMode && <button onClick={startEdit} style={{ padding: "5px 14px", borderRadius: 7, border: "1px solid #7c4dff", background: "white", color: "#7c4dff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✏️ 編集</button>}
                  <button onClick={function () { cc(editMode ? editText : raw, "ar"); }} style={{ padding: "5px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg,#41C9B4,#2BA89D)", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{copied === "ar" ? "✓コピー済" : "📋全文コピー"}</button>
                </div>
              </div>

              {editMode ? (
                <div>
                  <textarea value={editText} onChange={function(e){ setEditText(e.target.value); }} style={{ width: "100%", minHeight: 300, padding: 12, borderRadius: 7, border: "2px solid #7c4dff", fontSize: 13, lineHeight: 1.7, fontFamily: "monospace", boxSizing: "border-box", outline: "none", resize: "vertical", background: "#fafafe" }} />
                  <div style={{ marginTop: 8 }}>
                    <label style={stLabel}>💬 修正メモ（AIへの指示）</label>
                    <input value={editNote} onChange={function(e){ setEditNote(e.target.value); }} placeholder="例: 導入をもっと具体的に、まとめを短くして" style={stInput} />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button onClick={cancelEdit} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd", background: "white", fontSize: 12, cursor: "pointer" }}>キャンセル</button>
                    <button onClick={applyEditDirect} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "#7c4dff", color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📝 そのまま適用</button>
                    <button onClick={regenFromEdit} disabled={loading} style={{ flex: 1.5, padding: 10, borderRadius: 8, border: "none", background: loading ? "#ccc" : "linear-gradient(135deg,#ff9800,#f57c00)", color: "white", fontSize: 12, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>{loading ? (loadMsg || "⏳") : "🤖 AIで再生成"}</button>
                  </div>
                </div>
              ) : (
                <div style={{ background: "#fafafa", borderRadius: 7, padding: 14, fontSize: 13, lineHeight: 1.7, maxHeight: 400, overflowY: "auto", border: "1px solid #eee" }}>{renderBody(raw)}</div>
              )}
            </div>

            <div style={stCard}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>ハッシュタグ</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {!editTags && <button onClick={startTagEdit} style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #7c4dff", background: "white", color: "#7c4dff", fontSize: 10, cursor: "pointer" }}>✏️</button>}
                  <button onClick={function () { cc(tags.map(function (h) { return "#" + h; }).join(" "), "tg2"); }} style={btnCopy(copied === "tg2")}>{copied === "tg2" ? "✓" : "コピー"}</button>
                </div>
              </div>
              {editTags ? (
                <div>
                  <input value={tagInput} onChange={function(e){ setTagInput(e.target.value); }} placeholder="カンマ区切りでタグを入力" style={stInput} onKeyDown={function(e){ if(e.key==="Enter") applyTagEdit(); }} />
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    <button onClick={function(){ setEditTags(false); }} style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid #ddd", background: "white", fontSize: 11, cursor: "pointer" }}>戻す</button>
                    <button onClick={applyTagEdit} style={{ padding: "4px 10px", borderRadius: 5, border: "none", background: "#7c4dff", color: "white", fontSize: 11, cursor: "pointer" }}>適用</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{tags.map(function (h, i) { return <span key={i} style={stTag}>#{h}</span>; })}</div>
              )}
            </div>

            {outline && outline.seoDescription && <div style={stCard}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13, fontWeight: 600 }}>🔍 SEO説明文</span><button onClick={function () { cc(outline.seoDescription, "seo2"); }} style={btnCopy(copied === "seo2")}>{copied === "seo2" ? "✓" : "コピー"}</button></div>
              <p style={{ fontSize: 12, color: "#555", margin: 0, background: "#f5f5f5", borderRadius: 6, padding: "8px 10px" }}>{outline.seoDescription}</p>
            </div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={function () { setStep(1); }} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd", background: "white", fontSize: 13, cursor: "pointer" }}>← 構成</button>
              <button onClick={saveArt} disabled={loading || dbStatus === "saving"} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: dbStatus === "saving" ? "#ff9800" : "#7c4dff", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>💾 保存</button>
              <button onClick={reset} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "linear-gradient(135deg,#41C9B4,#2BA89D)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>🆕 新規</button>
            </div>

            <div style={{ background: "#f0faf8", borderRadius: 8, padding: 14, border: "1px solid #d4ede8", fontSize: 12, color: "#555", lineHeight: 1.7 }}>
              <p style={{ fontWeight: 700, color: "#2BA89D", margin: "0 0 6px" }}>📌 投稿手順</p>
              <p style={{ margin: "2px 0" }}>1. アイキャッチ → NanoBananaでサムネ生成</p>
              <p style={{ margin: "2px 0" }}>2. 本文内プロンプト → 画像生成({countImg(raw)}枚)</p>
              <p style={{ margin: "2px 0" }}>3. 全文コピー → note.comで投稿 → プロンプト箇所を画像に差替え</p>
              <p style={{ margin: "2px 0" }}>4. ハッシュタグ・SEO説明文設定</p>
              {paid && <p style={{ margin: "6px 0 0", color: "#e67e22", fontWeight: 600 }}>💰 有料: 公開設定 → 有料 → {price}円</p>}
            </div>
          </div>}
        </>}
      </div>
    </div>
  );
}
