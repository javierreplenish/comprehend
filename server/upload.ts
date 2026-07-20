import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

// ── Text extraction for every supported upload format ──
// This module does NOT talk to the AI. It turns an uploaded file into plain
// text (with chapter markers where the format gives us real boundaries) and
// hands off to the chunked processing pipeline in processing.ts.

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  return result.text;
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// EPUB is a zip: META-INF/container.xml points at an OPF package file whose
// <spine> lists the reading order of XHTML documents. We walk the spine so
// the text comes out in the order a reader would see it, and we drop an
// explicit "=== CHAPTER BREAK ===" marker between spine items - EPUBs give
// us real chapter boundaries for free, which makes the AI's chapter
// detection far more reliable than PDF heuristics.
export const EPUB_CHAPTER_MARKER = "\n\n=== CHAPTER BREAK ===\n\n";

export async function extractTextFromEpub(buffer: Buffer): Promise<string> {
  const zip = new AdmZip(buffer);
  const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

  const containerEntry = zip.getEntry("META-INF/container.xml");
  if (!containerEntry) throw new Error("Not a valid EPUB: missing META-INF/container.xml");
  const container = xml.parse(containerEntry.getData().toString("utf-8"));
  const rootfiles = container?.container?.rootfiles?.rootfile;
  const rootfile = Array.isArray(rootfiles) ? rootfiles[0] : rootfiles;
  const opfPath: string | undefined = rootfile?.["@_full-path"];
  if (!opfPath) throw new Error("Not a valid EPUB: could not locate the package file");

  const opfEntry = zip.getEntry(opfPath);
  if (!opfEntry) throw new Error(`Not a valid EPUB: package file ${opfPath} is missing`);
  const opf = xml.parse(opfEntry.getData().toString("utf-8"));
  const pkg = opf.package ?? opf["opf:package"];
  if (!pkg) throw new Error("Not a valid EPUB: malformed package file");

  // Manifest: id → href. Spine: ordered list of idrefs.
  const manifestItems = pkg.manifest?.item;
  const items: any[] = Array.isArray(manifestItems) ? manifestItems : manifestItems ? [manifestItems] : [];
  const hrefById = new Map<string, string>();
  for (const item of items) {
    if (item?.["@_id"] && item?.["@_href"]) hrefById.set(item["@_id"], item["@_href"]);
  }

  const spineItems = pkg.spine?.itemref;
  const spine: any[] = Array.isArray(spineItems) ? spineItems : spineItems ? [spineItems] : [];
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const sections: string[] = [];
  for (const ref of spine) {
    const href = hrefById.get(ref?.["@_idref"]);
    if (!href) continue;
    const entryPath = decodeURIComponent(opfDir + href).replace(/#.*$/, "");
    const entry = zip.getEntry(entryPath);
    if (!entry) continue;
    const text = htmlToText(entry.getData().toString("utf-8"));
    if (text.trim().length > 40) sections.push(text.trim()); // skip cover/blank pages
  }

  if (sections.length === 0) throw new Error("Could not extract any readable text from this EPUB.");
  return sections.join(EPUB_CHAPTER_MARKER);
}

// Minimal HTML → text: strip scripts/styles, turn block-level closings into
// line breaks, collapse entities and whitespace. Not a full parser, but EPUB
// content documents are simple XHTML and this holds up well in practice.
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(h[1-6]|p|div|li|blockquote|tr)>/gi, "\n")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

export interface ExtractedUpload {
  text: string;
  kind: "pdf" | "epub" | "docx" | "text";
}

export async function extractUploadedFile(buffer: Buffer, mimetype: string, filename: string): Promise<ExtractedUpload> {
  const lower = filename.toLowerCase();
  if (mimetype === "application/pdf" || lower.endsWith(".pdf")) {
    return { text: await extractTextFromPdf(buffer), kind: "pdf" };
  }
  if (mimetype === "application/epub+zip" || lower.endsWith(".epub")) {
    return { text: await extractTextFromEpub(buffer), kind: "epub" };
  }
  if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || lower.endsWith(".docx")) {
    return { text: await extractTextFromDocx(buffer), kind: "docx" };
  }
  if (mimetype === "text/plain" || lower.endsWith(".txt") || lower.endsWith(".md")) {
    return { text: buffer.toString("utf-8"), kind: "text" };
  }
  throw new Error(`Unsupported file type (${mimetype}). Upload a PDF, EPUB, DOCX, or plain text file.`);
}


// ── Flashcard spreadsheet import (.xlsx / .csv) ──
// A sheet of ready-made Q&A cards (from any tool) maps straight into the
// concepts table - no AI call, no cost, instant.
import * as XLSX from "xlsx";

export interface ImportedFlashcards {
  title: string;
  chapters: Array<{ title: string; cards: Array<{ question: string; answer: string }> }>;
}

export function parseFlashcardSpreadsheet(buffer: Buffer, filename: string): ImportedFlashcards {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The spreadsheet has no sheets.");
  const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
  if (rows.length === 0) throw new Error("The spreadsheet is empty.");

  const headers = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
  const findCol = (patterns: RegExp) => headers.findIndex((h) => patterns.test(h));
  let qCol = findCol(/question|front|prompt|term|card/);
  let aCol = findCol(/answer|back|definition|response|explanation/);
  const chCol = findCol(/chapter|section|unit|lesson|topic|category/);
  let dataRows = rows.slice(1);

  if (qCol === -1 || aCol === -1) {
    if ((rows[0]?.length ?? 0) >= 2) {
      qCol = 0;
      aCol = 1;
      dataRows = rows;
    } else {
      throw new Error("Couldn't find question/answer columns. Use headers like 'Question' and 'Answer' (a 'Chapter' column is optional).");
    }
  }

  const byChapter = new Map<string, Array<{ question: string; answer: string }>>();
  for (const row of dataRows) {
    const question = String(row[qCol] ?? "").trim();
    const answer = String(row[aCol] ?? "").trim();
    if (!question || !answer) continue;
    const chapter = chCol >= 0 && String(row[chCol] ?? "").trim() ? String(row[chCol]).trim() : "Flashcards";
    if (!byChapter.has(chapter)) byChapter.set(chapter, []);
    byChapter.get(chapter)!.push({ question, answer });
  }

  const chapters = [...byChapter.entries()].map(([title, cards]) => ({ title, cards }));
  const total = chapters.reduce((n, ch) => n + ch.cards.length, 0);
  if (total === 0) throw new Error("No usable question/answer rows found in the spreadsheet.");
  if (total > 5000) throw new Error("That's over 5,000 cards - split the sheet into smaller uploads.");

  return { title: filename.replace(/\.(xlsx|xls|csv)$/i, ""), chapters };
}
