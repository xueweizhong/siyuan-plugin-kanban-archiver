import { appendBlock, createDocWithMd, deleteBlock, lsNotebooks, renderAttributeView, setBlockAttrs, sql, pushErrMsg, pushMsg } from "./api";

function extractCellValue(v: any): string {
    if (!v) return "";
    if (Array.isArray(v)) return v.map((i: any) => extractCellValue(i)).filter(Boolean).join(", ");
    if (typeof v === "string") return v;
    if (typeof v === "number") return v.toString();
    if (v.content !== undefined) return v.content;
    if (v.text?.content !== undefined) return v.text.content;
    if (v.block?.content !== undefined) return v.block.content;
    if (v.date?.content !== undefined) return v.date.content;
    if (v.mSelect?.length > 0) return v.mSelect.map((i: any) => i.content).join(", ");
    if (v.select?.content !== undefined) return v.select.content;
    for (const key in v) {
        if (typeof v[key] === "object" && v[key] !== null) {
            const res = extractCellValue(v[key]);
            if (res) return res;
        }
    }
    return "";
}

function parseSiyuanTime(t: any): number {
    if (!t) return 0;
    const s = String(t).trim();
    if (s.match(/^\d{4}-\d{2}-\d{2}/)) {
        return new Date(s.substring(0, 10).replace(/-/g, "/") + " 00:00:00").getTime();
    }
    if (s.length === 14 && /^\d+$/.test(s)) {
        return new Date(
            s.substring(0, 4),
            parseInt(s.substring(4, 6), 10) - 1,
            s.substring(6, 8),
            s.substring(8, 10),
            s.substring(10, 12),
            s.substring(12, 14)
        ).getTime();
    }
    const val = parseInt(s, 10);
    if (s.length === 10) return val * 1000;
    return val;
}

function resolveTimestamp(raw: any): number {
    const primary = parseSiyuanTime(raw);
    if (primary && !Number.isNaN(primary)) return primary;
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
    return 0;
}

function getGroupLabel(obj: any): string {
    if (!obj || typeof obj !== "object") return "";
    if (typeof obj.name === "string") return obj.name;
    if (typeof obj.title === "string") return obj.title;
    if (typeof obj.label === "string") return obj.label;
    if (obj.value) {
        const v = extractCellValue(obj.value);
        if (v) return v;
    }
    if (obj.key) {
        const v = extractCellValue(obj.key);
        if (v) return v;
        if (typeof obj.key.name === "string") return obj.key.name;
    }
    return "";
}

function collectRows(obj: any, groupStatus = ""): any[] {
    let res: any[] = [];
    if (!obj || typeof obj !== "object") return res;
    if (obj.id && (Array.isArray(obj.cells) || Array.isArray(obj.values))) {
        if (groupStatus) {
            obj.__groupStatus = groupStatus;
        }
        res.push(obj);
    }
    for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
            const child = obj[k];
            if (Array.isArray(child)) {
                if (k === "groups") {
                    child.forEach((g: any) => {
                        const label = getGroupLabel(g) || groupStatus;
                        res = res.concat(collectRows(g, label));
                    });
                } else {
                    child.forEach((i: any) => res = res.concat(collectRows(i, groupStatus)));
                }
            } else if (typeof child === "object" && !["columns", "fields", "keyValues"].includes(k)) {
                res = res.concat(collectRows(child, groupStatus));
            }
        }
    }
    return res;
}

function getISOWeek(d: Date): number {
    const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    copy.setUTCDate(copy.getUTCDate() + 4 - (copy.getUTCDay() || 7));
    return Math.ceil((((copy.getTime() - new Date(Date.UTC(copy.getUTCFullYear(), 0, 1)).getTime()) / 86400000) + 1) / 7);
}

function formatDate(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function stripEmoji(str = ""): string {
    return str.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/gu, "");
}

function normalizeStatus(input: any): string {
    return stripEmoji(String(input || "")).toLowerCase().trim();
}

function escapeSqlValue(input: any): string {
    return String(input ?? "").replace(/'/g, "''");
}

function extractBlockId(v: any, depth = 0): string {
    if (!v || depth > 4) return "";
    if (Array.isArray(v)) {
        for (const item of v) {
            const found = extractBlockId(item, depth + 1);
            if (found) return found;
        }
        return "";
    }
    if (typeof v !== "object") return "";
    if (v.block?.id) return v.block.id;
    if (v.blockID) return v.blockID;
    if (v.id && typeof v.id === "string" && v.id.length >= 20) return v.id;
    for (const key of Object.keys(v)) {
        const found = extractBlockId(v[key], depth + 1);
        if (found) return found;
    }
    return "";
}

async function fetchBlockContents(ids: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const unique = Array.from(new Set(ids)).filter(Boolean);
    const chunkSize = 100;
    for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize).map(id => `'${escapeSqlValue(id)}'`).join(",");
        if (!chunk) continue;
        const rows = await sql(`SELECT id, content FROM blocks WHERE id IN (${chunk})`);
        if (rows && rows.length > 0) {
            rows.forEach((r: any) => {
                if (r?.id && r?.content !== undefined) result[r.id] = r.content;
            });
        }
    }
    return result;
}

function mdToPlain(md = ""): string {
    return md
        .replace(/^###\s+/gm, "")
        .replace(/^####\s+/gm, "")
        .replace(/^#####\s+/gm, "")
        .replace(/^\*\s\[\s\]\s/gm, "• ")
        .replace(/^\*\s\[x\]\s/gi, "• ")
        .trim();
}

function mdToHtml(md = ""): string {
    const lines = md.split("\n");
    let html = "";
    let inList = false;
    const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };

    for (const line of lines) {
        if (/^###\s+/.test(line)) { closeList(); html += `<h3>${line.replace(/^###\s+/, "")}</h3>`; continue; }
        if (/^####\s+/.test(line)) { closeList(); html += `<h4>${line.replace(/^####\s+/, "")}</h4>`; continue; }
        if (/^#####\s+/.test(line)) { closeList(); html += `<h5>${line.replace(/^#####\s+/, "")}</h5>`; continue; }

        const mChecked = line.match(/^\*\s\[x\]\s(.+)/i);
        const mUnchecked = line.match(/^\*\s\[\s\]\s(.+)/);
        if (mChecked || mUnchecked) {
            if (!inList) { html += "<ul>"; inList = true; }
            const text = mChecked ? mChecked[1] : mUnchecked[1];
            const checked = !!mChecked;
            html += `<li><input type="checkbox"${checked ? " checked" : ""} disabled /> <span>${text}</span></li>`;
            continue;
        }

        if (line.trim() === "") { closeList(); continue; }
        closeList();
        html += `<p>${line}</p>`;
    }
    closeList();
    return `<div>${html}</div>`;
}

function stripForClipboard(body: string, onlySections: boolean): string {
    if (!onlySections) return body;
    const lines = body.split("\n");
    const kept = lines.filter(line => !/^###\s/.test(line) && !/^####\s/.test(line));
    return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function copyToClipboard(plugin: any, template: any, body: string): Promise<void> {
    const noEmoji = stripEmoji(stripForClipboard(body, template.clipboardOnlySections));
    const plain = mdToPlain(noEmoji);
    const html = mdToHtml(noEmoji);
    try {
        // @ts-ignore
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
            // @ts-ignore
            await navigator.clipboard.write([
                // @ts-ignore
                new ClipboardItem({
                    "text/html": new Blob([html], { type: "text/html" }),
                    "text/plain": new Blob([plain], { type: "text/plain" })
                })
            ]);
        } else {
            await navigator.clipboard.writeText(plain);
        }
        const i18n = plugin.i18n || {};
        const msg = i18n.reportCopied || "内容已复制到剪切板";
        pushMsg(msg);
    } catch (e) {
        console.error("Copy to clipboard failed:", e);
    }
}

function getPeriodStart(date: Date, period: string): number {
    const d = new Date(date);
    if (period === "day") {
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }
    if (period === "week") {
        d.setDate(d.getDate() - (d.getDay() || 7) + 1);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }
    if (period === "month") {
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }
    if (period === "year") {
        d.setMonth(0, 1);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }
    return 0;
}

function buildPath(template: any, date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const weekNum = getISOWeek(date).toString().padStart(2, "0");
    const dateStr = formatDate(date);
    const period = template.period || "none";
    let defaultPath = `/日常记录/${year}/${month}/${dateStr}`;
    if (period === "week") defaultPath = `/周报/${year}/${year}-W${weekNum}`;
    else if (period === "month") defaultPath = `/月报/${year}/${year}-${month}`;
    else if (period === "year") defaultPath = `/年报/${year}`;
    if (!template.pathTemplate) return defaultPath;
    return template.pathTemplate
        .replace("{YYYY}", String(year))
        .replace("{MM}", month)
        .replace("{date}", dateStr)
        .replace("{WW}", weekNum);
}

async function writeToDoc(plugin: any, template: any, date: Date, md: string, memo: string, title: string): Promise<void> {
    const hpath = buildPath(template, date);
    const hpathSql = escapeSqlValue(hpath);
    const hpathSqlAlt = escapeSqlValue(hpath.substring(1));

    let docRes = await sql(`SELECT id FROM blocks WHERE (hpath = '${hpathSql}' OR hpath = '${hpathSqlAlt}') AND type='d' LIMIT 1`);
    let docId = docRes && docRes.length > 0 ? docRes[0].id : "";
    if (!docId) {
        const nbRes = await lsNotebooks();
        const nb = template.notebookId || nbRes?.notebooks?.[0]?.id;
        if (!nb) {
            pushErrMsg("未找到可用笔记本，请在设置中选择目标笔记本");
            return;
        }
        docId = await createDocWithMd(nb, hpath + ".sy", "");
        await new Promise(r => setTimeout(r, 600));
    }

    const allBlocks = await sql(`SELECT id FROM blocks WHERE root_id = '${docId}'`);
    const clearIds = (allBlocks || []).map((b: any) => b.id).filter((id: string) => id && id !== docId);
    for (const id of clearIds) {
        await deleteBlock(id);
    }
    if (clearIds.length > 0) await new Promise(r => setTimeout(r, 300));

    const result = await appendBlock("markdown", md, docId);
    if (result && result.length > 0) {
        for (const b of result) {
            if (b?.id) await setBlockAttrs(b.id, { memo });
        }
        pushMsg("报表已就绪");
    }
}

async function resolveAvFromProfile(plugin: any, profileId: string): Promise<{ avId: string; viewId: string; profileName: string }> {
    const profiles = plugin.config?.profiles || [];
    const profile = profiles.find((p: any) => p.id === profileId);
    if (!profile?.keyword) return { avId: "", viewId: "", profileName: "" };

    const docResult = await sql(`SELECT id FROM blocks WHERE content LIKE '%${profile.keyword}%' AND type = 'd' LIMIT 1`);
    if (!docResult || docResult.length === 0) return { avId: "", viewId: "", profileName: "" };
    const docId = docResult[0].id;

    const avBlockResult = await sql(`SELECT id, markdown FROM blocks WHERE root_id = '${docId}' AND type = 'av' LIMIT 1`);
    if (!avBlockResult || avBlockResult.length === 0) return { avId: "", viewId: "", profileName: "" };
    const avBlock = avBlockResult[0];
    const avIdMatch = avBlock.markdown.match(/data-av-id="([^"]+)"/);
    if (!avIdMatch) return { avId: "", viewId: "", profileName: "" };
    const avId = avIdMatch[1];
    const viewIdMatch = avBlock.markdown.match(/data-view-id="([^"]+)"/);
    const viewId = viewIdMatch ? viewIdMatch[1] : avId;
    return { avId, viewId, profileName: profile.name || profile.keyword || profile.id };
}

export async function generateTemplateReport(plugin: any, template: any): Promise<void> {
    try {
        const i18n = plugin.i18n || {};
        const t = (key: string, fallback: string) => i18n[key] || fallback;
        const selectedIds: string[] = template.ruleIds || [];
        if (!selectedIds || selectedIds.length === 0) {
            pushErrMsg(t("reportMissingKanban", "请先选择至少一个归档规则"));
            return;
        }

        const allBoards: Array<{ profileName: string; avData: any }> = [];
        for (const pid of selectedIds) {
            const resolved = await resolveAvFromProfile(plugin, pid);
            if (!resolved.avId) continue;
            const avData = await renderAttributeView(resolved.avId, resolved.viewId || resolved.avId, 2000, 1);
            if (!avData) continue;
            allBoards.push({ profileName: resolved.profileName, avData });
        }
        if (allBoards.length === 0) {
            pushErrMsg(t("reportMissingKanban", "请先选择至少一个归档规则"));
            return;
        }

        const now = new Date();
        const dateStr = formatDate(now);
        const period = template.period || "none";
        const periodStart = getPeriodStart(now, period);

        let defaultTitle = "报表 ({date})";
        if (period === "day") defaultTitle = "日报 ({date})";
        else if (period === "week") defaultTitle = "周报 ({date})";
        else if (period === "month") defaultTitle = "月报 ({date})";
        else if (period === "year") defaultTitle = "年报 ({date})";
        const titleTpl = template.titleTemplate || defaultTitle;
        const headerTitle = titleTpl.replace("{date}", dateStr);
        let body = `### ${headerTitle}\n\n`;

        for (const board of allBoards) {
            const avData = board.avData;
            const dataRoot = avData.view || avData;
            const rawColumns = dataRoot.columns || dataRoot.fields || [];
            const columns = rawColumns.map((c: any) => {
                const k = c?.key ?? c;
                if (!k) return null;
                return { id: k.id, name: k.name || "", type: k.type || "" };
            }).filter(Boolean) as Array<{ id: string; name: string; type: string }>;

            const pickIdx = (preds: Array<(c: any) => boolean>) => columns.findIndex(c => preds.some(p => p(c)));
            const cIdx = pickIdx([
                c => c.name.includes("内容"),
                c => c.name.toLowerCase().includes("content"),
                c => c.type === "block"
            ]);
            let sIdx = pickIdx([
                c => c.name.includes("状态"),
                c => c.name.toLowerCase().includes("status")
            ]);
            if (sIdx === -1) {
                sIdx = columns.findIndex(c => {
                    const t = String(c.type || "").toLowerCase();
                    return t === "select" || t === "mselect" || t === "multiselect" || t === "singleselect";
                });
            }
            let tIdx = pickIdx([
                c => c.name.includes("更新时间"),
                c => c.name.toLowerCase().includes("update"),
                c => c.name.includes("更新"),
                c => c.name.includes("修改")
            ]);
            if (tIdx === -1) tIdx = pickIdx([
                c => c.name.includes("完成"),
                c => c.name.includes("结束"),
                c => c.name.includes("归档"),
                c => c.name.toLowerCase().includes("done")
            ]);
            if (tIdx === -1) tIdx = pickIdx([
                c => c.name.includes("时间"),
                c => c.name.toLowerCase().includes("time"),
                c => c.type === "date"
            ]);

            console.log("[KanbanWorkflow][Report] columns:", columns.map(c => `${c.name}(${c.type || "unknown"})`));
            console.log("[KanbanWorkflow][Report] idx:", { cIdx, sIdx, tIdx });

            const allRows = collectRows(avData).map((raw: any) => {
                let cells = raw.cells || [];
                let valuesCells: any[] = [];
                if (raw.values) {
                    valuesCells = columns.map((col: any) => {
                        const vObj = raw.values.find((v: any) => v.keyID === col.id);
                        return vObj ? vObj.value : null;
                    });
                }
                const valuesFromCells = (cells || []).map((c: any) => extractCellValue(c));
                const valuesFromValues = (valuesCells || []).map((c: any) => extractCellValue(c));
                const hasCells = valuesFromCells.some((v: any) => String(v || "").trim() !== "");
                const hasValues = valuesFromValues.some((v: any) => String(v || "").trim() !== "");
                if (!hasCells && hasValues) {
                    cells = valuesCells;
                }
                const finalValues = cells === valuesCells ? valuesFromValues : valuesFromCells;
                const contentCell = cIdx !== -1 ? cells[cIdx] : null;
                const contentBlockId = extractBlockId(contentCell) || extractBlockId(raw?.block) || extractBlockId(raw);
                const contentFromRow = raw?.block?.content || raw?.content || raw?.name || "";
                return {
                    id: raw.id,
                    cells,
                    cellValues: finalValues,
                    contentBlockId,
                    contentFromRow,
                    updatedAt: raw.updatedAt || raw.updated || 0,
                    groupStatus: raw.__groupStatus || ""
                };
            });

            const blockIdMap = await fetchBlockContents(
                allRows
                    .map((r: any) => r.contentBlockId || "")
                    .filter(Boolean)
            );

            const sections = (template.sections || []).map((s: any) => ({
                id: s.id,
                title: s.title,
                statusesRaw: (s.statuses || []).map((v: string) => String(v)),
                statuses: (s.statuses || []).map((v: string) => normalizeStatus(v)).filter(Boolean),
                items: [] as string[]
            }));
            const statusCandidates = sections.flatMap((s: any) => s.statuses).filter(Boolean);
            console.log("[KanbanWorkflow][Report] statusCandidates:", statusCandidates);

            allRows.forEach((row: any, idx: number) => {
                const cellValues = row.cellValues || row.cells.map((c: any) => extractCellValue(c));
                if (idx === 0) console.log("[KanbanWorkflow][Report] sampleRow:", cellValues);
                let text = cIdx !== -1 ? cellValues[cIdx] : "";
                if (!text && row.contentFromRow) {
                    text = row.contentFromRow;
                }
                if (!text && row.contentBlockId && blockIdMap[row.contentBlockId]) {
                    text = blockIdMap[row.contentBlockId];
                }
                if (!text) {
                    const fallback = cellValues.find((v: any, i: number) => {
                        if (i === sIdx || i === tIdx) return false;
                        return String(v || "").trim() !== "";
                    });
                    text = fallback || "";
                }
                if (!text) {
                    text = t("reportFallbackContent", "无内容");
                }

                if (period === "week") {
                    text = text.replace(/\b\d+(\.\d+)?\s*[hH]\b/gi, "").replace(/\((?:\d\.?)+[hH]\)/g, "").trim();
                    if (!text && Array.isArray(row.cells?.[cIdx]) && row.cells[cIdx].length > 0) {
                        text = row.cells[cIdx].map((v: any) => extractCellValue(v)).join(", ");
                    }
                }

                let status = sIdx !== -1 ? cellValues[sIdx] : "";
                if (!status && row.groupStatus) status = row.groupStatus;
                if (!status) {
                    const fallback = cellValues.find((v: string) => {
                        const vL = String(v || "").toLowerCase();
                        return statusCandidates.some((st: string) => vL.includes(st));
                    });
                    status = fallback || "";
                }
                if (idx === 0) console.log("[KanbanWorkflow][Report] sampleStatus:", status);
                const attrTimeStr = tIdx !== -1 ? cellValues[tIdx] : "";
                const attrTs = resolveTimestamp(attrTimeStr);
                const updTs = resolveTimestamp(row.updatedAt);
                const finalTime = period !== "none" ? (attrTs || updTs || 0) : (attrTs || updTs || Date.now());

                const sL = normalizeStatus(status);
                const isDoneLike = sL.includes("已完成") || sL.includes("done") || sL.includes("完成") || sL.includes("finish") || sL.includes("ok");
                const isArchivedLike = sL.includes("归档") || sL.includes("archived") || sL.includes("存档") || sL.includes("archive");
                const shouldPeriodFilter = period !== "none" && (isDoneLike || isArchivedLike);
                if (shouldPeriodFilter && finalTime < periodStart) return;

                const line = `${isDoneLike ? "* [x]" : "* [ ]"} ${text}`.trim();
                const statusTokens = sL.split(/[,，]/).map(v => v.trim()).filter(Boolean);
                const matchedNormalized = sections.filter((s: any) => s.statuses.length > 0 && s.statuses.some((st: string) => {
                    if (!st) return false;
                    if (sL.includes(st)) return true;
                    return statusTokens.some(tok => tok.includes(st) || st.includes(tok));
                }));
                let matched = matchedNormalized;
                if (matched.length === 0) {
                    const sRaw = String(status || "").toLowerCase();
                    matched = sections.filter((s: any) => (s.statusesRaw || []).some((st: string) => {
                        const stL = String(st || "").toLowerCase();
                        if (!stL) return false;
                        return sRaw.includes(stL) || stL.includes(sRaw);
                    }));
                }
                if (matched.length === 0) return;
                matched.forEach((s: any) => s.items.push(line));
            });

            const boardTitle = `${t("reportBoardTitle", "看板")}: ${board.profileName}`;
            body += `#### ${boardTitle}\n\n`;

            for (const section of sections) {
                body += `##### ${section.title}\n`;
                if (section.items.length > 0) {
                    body += `${section.items.join("\n")}\n\n`;
                } else {
                    body += `\n`;
                }
            }
        }

        const finalMd = stripEmoji(body);
        await writeToDoc(plugin, template, now, finalMd, `summary-${template.id}`, headerTitle);
        await copyToClipboard(plugin, template, finalMd);
    } catch (e: any) {
        console.error(e);
        pushErrMsg("生成过程中遇障");
    }
}
