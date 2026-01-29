import { appendBlock, createDocWithMd, deleteBlock, lsNotebooks, renderAttributeView, setBlockAttrs, sql, pushErrMsg, pushMsg } from "./api";

function extractCellValue(v: any): string {
    if (!v) return "";
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

function collectRows(obj: any): any[] {
    let res: any[] = [];
    if (!obj || typeof obj !== "object") return res;
    if (obj.id && (Array.isArray(obj.cells) || Array.isArray(obj.values))) res.push(obj);
    for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
            if (Array.isArray(obj[k])) obj[k].forEach((i: any) => res = res.concat(collectRows(i)));
            else if (typeof obj[k] === "object" && !["columns", "fields", "keyValues"].includes(k)) res = res.concat(collectRows(obj[k]));
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

    let docRes = await sql(`SELECT id FROM blocks WHERE (hpath = '${hpath}' OR hpath = '${hpath.substring(1)}') AND type='d' LIMIT 1`);
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

    const toDelete: any[] = [];
    const resMemo = await sql(`SELECT id FROM blocks WHERE memo = '${memo}' AND root_id = '${docId}'`);
    if (resMemo) toDelete.push(...resMemo);

    const resTitle = await sql(`SELECT id, parent_id, content FROM blocks WHERE root_id = '${docId}' AND content LIKE '%${title}%' AND type='h'`);
    if (resTitle && resTitle.length > 0) {
        const orderRes = await sql(`SELECT id, content, type FROM blocks WHERE root_id = '${docId}' ORDER BY sort ASC`);
        const order = orderRes || [];
        const idToIdx = new Map(order.map((b: any, i: number) => [b.id, i]));

        for (const item of resTitle) {
            const start = idToIdx.has(item.id) ? idToIdx.get(item.id) as number : -1;
            if (start === -1) continue;
            for (let i = start; i < order.length; i++) {
                const blk = order[i];
                if (i > start && blk.type === "h") break;
                toDelete.push(blk);
            }
        }
    }

    const uniqueIds = Array.from(new Set(toDelete.map((b: any) => b.id))).filter(Boolean);
    for (const id of uniqueIds) {
        await deleteBlock(id);
    }
    if (uniqueIds.length > 0) await new Promise(r => setTimeout(r, 300));

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
                const k = c.key || c;
                return { id: k.id, name: k.name || "", type: k.type || "" };
            });

            const pickIdx = (preds: Array<(c: any) => boolean>) => columns.findIndex(c => preds.some(p => p(c)));
            const cIdx = pickIdx([
                c => c.name.includes("内容"),
                c => c.name.toLowerCase().includes("content"),
                c => c.type === "block"
            ]);
            const sIdx = pickIdx([
                c => c.name.includes("状态"),
                c => c.name.toLowerCase().includes("status")
            ]);
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

            const allRows = collectRows(avData).map((raw: any) => {
                let cells = raw.cells || [];
                if (!raw.cells && raw.values) {
                    cells = columns.map((col: any) => {
                        const vObj = raw.values.find((v: any) => v.keyID === col.id);
                        return vObj ? vObj.value : null;
                    });
                }
                return { id: raw.id, cells, updatedAt: raw.updatedAt || raw.updated || 0 };
            });

            const sections = (template.sections || []).map((s: any) => ({
                id: s.id,
                title: s.title,
                statuses: (s.statuses || []).map((v: string) => String(v).toLowerCase()),
                items: [] as string[]
            }));

            allRows.forEach((row: any) => {
                const cellValues = row.cells.map((c: any) => extractCellValue(c));
                let text = cIdx !== -1 ? cellValues[cIdx] : t("reportFallbackContent", "无内容");

                if (period === "week") {
                    text = text.replace(/\b\d+(\.\d+)?\s*[hH]\b/gi, "").replace(/\((?:\d\.?)+[hH]\)/g, "").trim();
                    if (!text && Array.isArray(row.cells?.[cIdx]) && row.cells[cIdx].length > 0) {
                        text = row.cells[cIdx].map((v: any) => extractCellValue(v)).join(", ");
                    }
                }

                const status = sIdx !== -1 ? cellValues[sIdx] : "";
                const attrTimeStr = tIdx !== -1 ? cellValues[tIdx] : "";
                const attrTs = resolveTimestamp(attrTimeStr);
                const updTs = resolveTimestamp(row.updatedAt);
                const finalTime = period !== "none" ? (attrTs || updTs || 0) : (attrTs || updTs || Date.now());

                const sL = (status || "").toLowerCase();
                const isDoneLike = sL.includes("已完成") || sL.includes("done") || sL.includes("完成") || sL.includes("finish") || sL.includes("ok");
                const isArchivedLike = sL.includes("归档") || sL.includes("archived") || sL.includes("存档") || sL.includes("archive");
                const shouldPeriodFilter = period !== "none" && (isDoneLike || isArchivedLike);
                if (shouldPeriodFilter && finalTime < periodStart) return;

                const line = `${isDoneLike ? "* [x]" : "* [ ]"} ${text}`;
                const matched = sections.filter((s: any) => s.statuses.length > 0 && s.statuses.some((st: string) => sL.includes(st)));
                if (matched.length === 0) return;
                matched[0].items.push(line);
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
