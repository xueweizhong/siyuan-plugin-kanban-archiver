import { Plugin } from "siyuan";
import { settingsStore as settings } from "../stores/settings";
import { get } from "svelte/store";
import { archiveKanbanTasks } from "../api/kanban";

export class KanbanScheduler {
    private plugin: Plugin;
    private timer: any;
    private CHECK_INTERVAL = 60 * 1000; // Check every minute

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    init() {
        console.log("Initializing Kanban Scheduler...");

        // 1. Start-up Check (Catch-up logic)
        // Delay slightly to avoid slowing down startup
        setTimeout(() => {
            this.checkAndRun();
        }, 60 * 1000); // Check 1 minute after startup

        // 2. Regular Interval Check
        this.timer = setInterval(() => {
            this.checkAndRun();
        }, this.CHECK_INTERVAL);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async checkAndRun() {
        const currentSettings = get(settings);

        // Check if feature is enabled
        if (!currentSettings.autoArchiveKanban) {
            return;
        }

        const now = new Date();
        const todayStr = this.formatDate(now);

        // Check if already run today
        if (currentSettings.lastArchiveDate === todayStr) {
            return;
        }

        console.log(`Auto-archive pending for ${todayStr}. Last run: ${currentSettings.lastArchiveDate}`);

        // Run Archive
        const success = await archiveKanbanTasks(false);

        if (success) {
            // Update last run date
            this.plugin.saveSettings({
                ...currentSettings,
                lastArchiveDate: todayStr
            });
            console.log("Auto-archive completed and date updated.");
        }
    }

    private formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}
