import { Plugin, Protyle, Dialog, Menu } from "siyuan";
import { archiveKanbanTasks, restoreKanbanTasks } from "./api/kanban";
import { getAttributeViewKeysByAvID, lsNotebooks, sql, pushMsg } from "./api";
import { setPluginInstance } from "./utils/i18n";
import Settings from "./Settings.svelte";
import { generateTemplateReport } from "./report";

export default class KanbanWorkflowPlugin extends Plugin {

    private timer: any;
    private isMobile: boolean;
    public config: any = {};

    // Undo Stack: { date: number, ids: string[] }[]
    private undoStack: any[] = [];
    private readonly MAX_UNDO_COUNT = 30;
    private readonly MAX_UNDO_DAYS = 7;

    async onload() {
        setPluginInstance(this);
        console.log("Loading Kanban Workflow Plugin v0.1.0");

        await this.loadAndNormalizeConfig();

        // Load Undo History
        try {
            const history = await this.loadData("undo_history.json");
            if (history && Array.isArray(history)) {
                this.undoStack = history;
            }
        } catch (e) {
            console.error("Failed to load undo history", e);
        }

        // Register top bar icon
        const topBarElement = this.addTopBar({
            icon: "iconFiles",
            title: this.i18n.pluginName || "看板工作流",
            position: "right",
            callback: (event: any) => {
                if (this.isMobile) {
                    this.showMobileMenu();
                    return;
                }

                let rect;
                if (event && event.currentTarget && event.currentTarget.getBoundingClientRect) {
                    rect = event.currentTarget.getBoundingClientRect();
                } else {
                    rect = topBarElement.getBoundingClientRect();
                }

                const menu = new Menu("kanban-archiver-menu");
                menu.addItem({
                    icon: "iconFiles",
                    label: this.i18n.archiveNow || "立即归档",
                    click: () => {
                        this.archiveNow();
                    }
                });
                const templates = this.config.templates || [];
                templates.forEach((tpl: any) => {
                    menu.addItem({
                        icon: "iconCalendar",
                        label: `${this.i18n.generateTemplatePrefix || "生成"}：${tpl.name}`,
                        click: () => {
                            this.generateTemplate(tpl.id);
                        }
                    });
                });
                menu.addItem({
                    icon: "iconUndo",
                    label: `${this.i18n.undoArchive || "撤销归档"} (${this.undoStack.length})`,
                    disabled: this.undoStack.length === 0,
                    click: () => {
                        this.undoArchiveNow();
                    }
                });
                menu.addItem({
                    icon: "iconSettings",
                    label: this.i18n.settings || "设置",
                    click: () => {
                        this.openSetting();
                    }
                });

                menu.open({
                    x: rect.left,
                    y: rect.bottom,
                    isLeft: true,
                });
            }
        });

        // Register commands
        this.addCommand({
            langKey: "openSettings",
            langText: this.i18n.cmdOpenSettings || "打开设置",
            hotkey: "",
            callback: () => {
                this.openSetting();
            }
        });

        this.addCommand({
            langKey: "archiveNow",
            langText: this.i18n.cmdArchiveNow || "立即归档看板任务",
            hotkey: "",
            callback: () => {
                this.archiveNow();
            }
        });

        this.addCommand({
            langKey: "undoArchiveNow",
            langText: this.i18n.cmdUndoArchive || "撤销归档（最近一次）",
            hotkey: "",
            callback: () => {
                this.undoArchiveNow();
            }
        });

        const templates = this.config.templates || [];
        templates.forEach((tpl: any) => {
            this.addCommand({
                langKey: `generateTemplate_${tpl.id}`,
                langText: `${this.i18n.generateTemplatePrefix || "生成"}：${tpl.name}`,
                hotkey: "",
                callback: () => {
                    this.generateTemplate(tpl.id);
                }
            });
        });

        // Initialize scheduler
        this.initScheduler();
    }

    private async loadAndNormalizeConfig() {
        const loaded = await this.loadData("config.json");
        this.config = {
            profiles: [],
            archiveTime: "00:00",
            lastRunDate: "",
            templates: [],
            ...loaded
        };
        this.ensureDefaultTemplates();
        this.normalizeTemplates();

        if (!this.config.profiles || !Array.isArray(this.config.profiles)) {
            this.config.profiles = [];
        }

        if (loaded && (loaded.kanbanKeyword || loaded.completedStatus) && this.config.profiles.length === 0) {
            console.log("Migrating legacy config to Profile 1...");
            this.config.profiles.push({
                id: this.generateUUID(),
                name: this.i18n.defaultRuleName || "默认规则",
                keyword: loaded.kanbanKeyword || this.i18n.defaultKeyword || "我的工作看板",
                completedStatus: loaded.completedStatus || this.i18n.defaultCompleted || "已完成",
                archivedStatus: loaded.archivedStatus || this.i18n.defaultArchived || "归档",
                enabled: true
            });
            delete this.config.kanbanKeyword;
            delete this.config.completedStatus;
            delete this.config.archivedStatus;
            this.saveData("config.json", this.config);
        } else if (this.config.profiles.length === 0) {
            this.config.profiles.push({
                id: this.generateUUID(),
                name: this.i18n.defaultMyRule || "我的规则",
                keyword: this.i18n.defaultKeyword || "我的工作看板",
                completedStatus: this.i18n.defaultCompleted || "已完成",
                archivedStatus: this.i18n.defaultArchived || "归档",
                enabled: true
            });
        }

        let changed = false;
        this.config.profiles.forEach((p: any) => {
            if (p.enabled === undefined) {
                p.enabled = true;
                changed = true;
            }
        });
        if (changed) {
            this.saveData("config.json", this.config);
        }
    }

    private ensureDefaultTemplates() {
        if (!this.config.templates || !Array.isArray(this.config.templates) || this.config.templates.length === 0) {
            this.config.templates = [
                {
                    id: this.generateUUID(),
                    name: this.i18n.defaultDailyTemplate || "今日汇总",
                    period: "day",
                    ruleIds: [],
                    notebookId: "",
                    pathTemplate: "",
                    clipboardOnlySections: false,
                    titleTemplate: "日报 ({date})",
                    sections: [
                        { id: this.generateUUID(), title: "待办", statuses: ["待办", "todo", "backlog", "未开始"] },
                        { id: this.generateUUID(), title: "进行中", statuses: ["进行中", "doing", "inprogress"] },
                        { id: this.generateUUID(), title: "已完成", statuses: ["已完成", "done", "完成", "finish", "ok", "归档", "archived"] }
                    ]
                },
                {
                    id: this.generateUUID(),
                    name: this.i18n.defaultWeeklyTemplate || "本周回顾",
                    period: "week",
                    ruleIds: [],
                    notebookId: "",
                    pathTemplate: "",
                    clipboardOnlySections: false,
                    titleTemplate: "周报 ({date})",
                    sections: [
                        { id: this.generateUUID(), title: "当前工作", statuses: ["进行中", "doing", "inprogress"] },
                        { id: this.generateUUID(), title: "已完成及归档 (本周)", statuses: ["已完成", "done", "完成", "finish", "ok", "归档", "archived"] },
                        { id: this.generateUUID(), title: "下周工作计划", statuses: ["待办", "todo", "backlog", "未开始"] }
                    ]
                }
            ];
            this.saveData("config.json", this.config);
        }
    }

    private normalizeTemplates() {
        if (!Array.isArray(this.config.templates)) return;
        let mutated = false;
        this.config.templates.forEach((tpl: any) => {
            if (!tpl.period && tpl.type) {
                tpl.period = tpl.type === "weekly" ? "week" : "day";
                mutated = true;
            }
            if (!tpl.period) {
                tpl.period = "none";
                mutated = true;
            }
            if (!tpl.sections) {
                tpl.sections = [];
                mutated = true;
            }
        });
        if (mutated) this.saveData("config.json", this.config);
    }

    async reloadConfig() {
        await this.loadAndNormalizeConfig();
    }

    onLayoutReady() {
        this.isMobile = this.app.isMobile;
    }

    onunload() {
        console.log("Unloading Kanban Workflow Plugin");
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    uninstall() {
        console.log("Uninstalling Kanban Workflow Plugin");
        this.removeData("config.json");
        this.removeData("undo_history.json");
    }

    openSetting() {
        const dialog = new Dialog({
            title: this.i18n.settingTitle || "看板工作流设置",
            content: "<div id='kanban-archiver-settings' style='height: 100%;'></div>",
            width: "70vw",
            height: "80vh",
            destroyCallback: () => {
                pannel.$destroy();
            }
        });
        const pannel = new Settings({
            target: dialog.element.querySelector("#kanban-archiver-settings"),
            props: {
                plugin: this
            }
        });
    }

    private showMobileMenu() {
        const menu = new Menu("kanban-archiver-menu");
        menu.addItem({
            icon: "iconFiles",
            label: this.i18n.archiveNow || "立即归档",
            click: () => {
                this.archiveNow();
            }
        });
        const templates = this.config.templates || [];
        templates.forEach((tpl: any) => {
            menu.addItem({
                icon: "iconCalendar",
                label: `${this.i18n.generateTemplatePrefix || "生成"}：${tpl.name}`,
                click: () => {
                    this.generateTemplate(tpl.id);
                }
            });
        });
        menu.addItem({
            icon: "iconUndo",
            label: `${this.i18n.undoArchive || "撤销归档"} (${this.undoStack.length})`,
            disabled: this.undoStack.length === 0,
            click: () => {
                this.undoArchiveNow();
            }
        });
        menu.addItem({
            icon: "iconSettings",
            label: this.i18n.settings || "设置",
            click: () => {
                this.openSetting();
            }
        });
        menu.fullscreen();
    }

    private initScheduler() {
        console.log("Initializing Kanban Scheduler...");
        this.checkAndRunArchive();
        this.timer = setInterval(() => {
            this.checkAndRunArchive();
        }, 60 * 1000);
    }

    private checkAndRunArchive() {
        if (!this.config.archiveTime) return;

        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const currentTimeVal = hours * 60 + minutes;

        let configHours = 0;
        let configMinutes = 0;
        try {
            const parts = this.config.archiveTime.split(':').map(Number);
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                configHours = parts[0];
                configMinutes = parts[1];
            }
        } catch (e) {
            return;
        }

        const configTimeVal = configHours * 60 + configMinutes;
        const today = now.toLocaleDateString();

        if (this.config.lastRunDate === today) {
            return;
        }

        if (currentTimeVal >= configTimeVal) {
            this.config.lastRunDate = today;
            this.saveData("config.json", this.config);
            this.archiveNow(false);
        }
    }

    private async saveUndoHistory() {
        if (this.undoStack.length > this.MAX_UNDO_COUNT) {
            this.undoStack = this.undoStack.slice(this.undoStack.length - this.MAX_UNDO_COUNT);
        }
        const limitTime = new Date().getTime() - (this.MAX_UNDO_DAYS * 24 * 60 * 60 * 1000);
        this.undoStack = this.undoStack.filter(record => record.date > limitTime);
        await this.saveData("undo_history.json", this.undoStack);
    }

    public async archiveNow(manual: boolean = true) {
        if (manual) {
            if (!window.confirm(this.i18n.confirmArchiveNow || "确认立即归档当前规则对应的任务？")) {
                return;
            }
        }
        try {
            const ids = await archiveKanbanTasks(this, manual);
            if (ids && ids.length > 0) {
                this.undoStack.push({
                    date: new Date().getTime(),
                    ids: ids
                });
                await this.saveUndoHistory();
            } else {
                const msg = this.i18n.archiveEmpty || "未发现可归档任务";
                pushMsg(msg);
            }
        } catch (e) {
            console.error("Archive task error:", e);
        }
    }

    public async undoArchiveNow() {
        if (this.undoStack.length === 0) {
            return;
        }
        try {
            const record = this.undoStack.pop();
            this.saveUndoHistory();
            if (record && record.ids && record.ids.length > 0) {
                await restoreKanbanTasks(this, record.ids);
            }
        } catch (e) {
            console.error("Undo archive task error:", e);
        }
    }

    public async generateTemplate(templateId: string) {
        const tpl = (this.config.templates || []).find((t: any) => t.id === templateId);
        if (!tpl) return;
        await generateTemplateReport(this, tpl);
    }

    public async getNotebooks() {
        return await lsNotebooks();
    }

    public async getStatusOptions(ruleIds: string[]): Promise<string[]> {
        const profiles = this.config.profiles || [];
        const statuses: Set<string> = new Set();
        for (const rid of ruleIds) {
            const profile = profiles.find((p: any) => p.id === rid);
            if (!profile?.keyword) continue;
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
            for (const key of keys) {
                if ((key.type === "select" || key.type === "mSelect") && key.options) {
                    key.options.forEach((opt: any) => {
                        if (opt?.name) statuses.add(opt.name);
                    });
                }
            }
        }
        return Array.from(statuses);
    }

    private generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}
