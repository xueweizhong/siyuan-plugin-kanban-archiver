import { sql, getAttributeViewKeysByAvID, renderAttributeView, setAttributeViewBlockAttr, pushMsg, pushErrMsg } from "../api";

/**
 * 通用：切换看板任务状态
 */
export async function switchKanbanTaskStatus(plugin: any, profile: any, fromStatus: string, toStatus: string, manual: boolean = false): Promise<string[]> {
    try {
        const keyword = profile.keyword;
        console.log(`Starting Kanban status switch for profile "${profile.name}": "${fromStatus}" -> "${toStatus}"`);

        // 1. Find Kanban Doc
        const docResult = await sql(`SELECT id FROM blocks WHERE content LIKE '%${keyword}%' AND type = 'd' LIMIT 1`);
        if (!docResult || docResult.length === 0) {
            console.log(`Kanban doc not found for keyword: ${keyword}`);
            return [];
        }
        const docId = docResult[0].id;

        // 2. Find AV Block
        const avBlockResult = await sql(`SELECT id, markdown FROM blocks WHERE root_id = '${docId}' AND type = 'av' LIMIT 1`);
        if (!avBlockResult || avBlockResult.length === 0) {
            if (manual) pushErrMsg(`文档中未找到数据库视图 (Profile: ${profile.name})`);
            return [];
        }
        const avBlock = avBlockResult[0];

        // 3. Extract IDs
        const avIdMatch = avBlock.markdown.match(/data-av-id="([^"]+)"/);
        if (!avIdMatch) return [];
        const avId = avIdMatch[1];

        // 4. Get Columns
        const keys = await getAttributeViewKeysByAvID(avId);
        if (!keys) return [];

        // Find status column and options
        let statusKey: any = null;
        let optFrom: any = null;
        let optTo: any = null;

        for (const key of keys) {
            if ((key.type === 'select' || key.type === 'mSelect') && key.options) {
                const f = key.options.find((opt: any) => opt.name === fromStatus);
                const t = key.options.find((opt: any) => opt.name === toStatus);
                if (f && t) {
                    statusKey = key;
                    optFrom = f;
                    optTo = t;
                    break;
                }
            }
        }

        if (!statusKey) {
            if (manual) pushErrMsg(`在 "${profile.name}" 中未找到状态 "${fromStatus}" -> "${toStatus}"`);
            return [];
        }

        // 5. Get Rows
        const viewIdMatch = avBlock.markdown.match(/data-view-id="([^"]+)"/);
        let viewId = viewIdMatch ? viewIdMatch[1] : avId;
        let avData = await renderAttributeView(avId, viewId);

        const getAllRows = (data: any, depth = 0): any[] => {
            if (!data || depth > 5) return [];
            let collected: any[] = [];

            const arrayProps = ['rows', 'groups', 'blocks', 'children', 'items'];
            for (const prop of arrayProps) {
                if (Array.isArray(data[prop])) {
                    for (const item of data[prop]) {
                        if (item.id && Array.isArray(item.cells)) {
                            collected.push(item);
                        } else {
                            collected = collected.concat(getAllRows(item, depth + 1));
                        }
                    }
                }
            }
            if (data.view) {
                collected = collected.concat(getAllRows(data.view, depth + 1));
            }
            return collected;
        };

        let rows = getAllRows(avData);
        if (rows.length === 0 && avData?.views) {
            const tableView = avData.views.find((v: any) => v.type === 'table');
            if (tableView) {
                avData = await renderAttributeView(avId, tableView.id);
                rows = getAllRows(avData);
            }
        }

        if (rows.length === 0) return [];

        // 6. Filter & Update
        const columns = avData.view?.columns || avData.columns || [];
        let statusColIndex = columns.findIndex((c: any) => c.id === statusKey.id);

        let modifiedIds: string[] = [];
        let updateCount = 0;

        for (const row of rows) {
            let matchesFrom = false;
            if (statusColIndex >= 0 && row.cells && row.cells[statusColIndex]) {
                const cellValue = row.cells[statusColIndex].value;
                if (cellValue?.mSelect) {
                    matchesFrom = cellValue.mSelect.some((s: any) => s.content === fromStatus);
                } else if (cellValue?.select) {
                    matchesFrom = cellValue.select.content === fromStatus;
                }
            } else {
                if (row.cells && Array.isArray(row.cells)) {
                    for (const cell of row.cells) {
                        const val = cell.value;
                        if (val?.mSelect?.some((s: any) => s.content === fromStatus)) {
                            matchesFrom = true;
                            break;
                        } else if (val?.select?.content === fromStatus) {
                            matchesFrom = true;
                            break;
                        }
                    }
                }
            }

            if (matchesFrom) {
                const newValue = {
                    mSelect: [{
                        content: optTo.name,
                        color: optTo.color
                    }]
                };
                await setAttributeViewBlockAttr(avId, statusKey.id, row.id, newValue);
                modifiedIds.push(row.id);
                updateCount++;
            }
        }

        if (updateCount > 0) {
            pushMsg(`[${profile.name}] 已归档 ${updateCount} 个任务`);
        }

        return modifiedIds;

    } catch (e) {
        console.error("Status switch failed:", e);
        if (manual) pushErrMsg(`[${profile.name}] 出错: ` + e.message);
        return [];
    }
}

/**
 * 恢复特定ID的任务状态为“已完成”
 */
export async function restoreKanbanTasks(plugin: any, taskIds: string[]): Promise<boolean> {
    if (!taskIds || taskIds.length === 0) return false;
    const profiles = plugin.config.profiles || [];

    let totalRestored = 0;

    for (const profile of profiles) {
        try {
            const docResult = await sql(`SELECT id FROM blocks WHERE content LIKE '%${profile.keyword}%' AND type = 'd' LIMIT 1`);
            if (!docResult || docResult.length === 0) continue;
            const docId = docResult[0].id;

            const avBlockResult = await sql(`SELECT id, markdown FROM blocks WHERE root_id = '${docId}' AND type = 'av' LIMIT 1`);
            if (!avBlockResult || avBlockResult.length === 0) continue;
            const avBlock = avBlockResult[0];
            const avIdMatch = avBlock.markdown.match(/data-av-id="([^"]+)"/);
            if (!avIdMatch) continue;
            const avId = avIdMatch[1];

            const keys = await getAttributeViewKeysByAvID(avId);
            if (!keys) continue;

            let statusKey: any = null;
            let optTarget: any = null;
            for (const key of keys) {
                if ((key.type === 'select' || key.type === 'mSelect') && key.options) {
                    const t = key.options.find((opt: any) => opt.name === profile.completedStatus);
                    if (t) {
                        statusKey = key;
                        optTarget = t;
                        break;
                    }
                }
            }
            if (!statusKey || !optTarget) continue;

            const newValue = {
                mSelect: [{
                    content: optTarget.name,
                    color: optTarget.color
                }]
            };

            for (const id of taskIds) {
                // Try setting for all. Blind try.
                await setAttributeViewBlockAttr(avId, statusKey.id, id, newValue);
            }
            totalRestored += taskIds.length;
        } catch (e) {
            console.warn("Restore attempted failed for profile", profile.name, e);
        }
    }

    if (totalRestored > 0) {
        pushMsg(`已尝试撤销恢复任务`);
        return true;
    }
    return false;
}

/**
 * 归档任务
 */
export async function archiveKanbanTasks(plugin: any, manual: boolean = false, profileIds?: string[]): Promise<string[]> {
    let profiles = plugin.config.profiles || [];
    let allModifiedIds: string[] = [];

    if (profiles.length === 0) {
        if (manual) pushErrMsg("未配置任何归档规则，请在设置中添加");
        return [];
    }

    if (Array.isArray(profileIds) && profileIds.length > 0) {
        profiles = profiles.filter((p: any) => profileIds.includes(p.id));
    }

    for (const profile of profiles) {
        if (!profile.keyword || profile.enabled === false) continue;
        const ids = await switchKanbanTaskStatus(plugin, profile, profile.completedStatus, profile.archivedStatus, manual);
        allModifiedIds = allModifiedIds.concat(ids);
    }

    return allModifiedIds;
}
