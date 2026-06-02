<script lang="ts">
    import { onMount, tick } from "svelte";
    import { t } from "./utils/i18n";
    export let plugin: any;

    let profiles = [];
    let archiveTime = "00:00";
    let expandedId = null;
    let templates = [];
    let expandedTemplateId = null;
    let notebooks = [];
    let statusOptions = {};

    // Time Picker State
    let showTimePicker = false;
    const hours = Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0'));
    const minutes = Array.from({length: 60}, (_, i) => i.toString().padStart(2, '0'));

    onMount(() => {
        refresh();
        if (plugin.config.profiles && plugin.config.profiles.length === 1) {
            expandedId = plugin.config.profiles[0].id;
        }
        loadNotebooks();
    });

    function refresh() {
        profiles = plugin.config.profiles || [];
        archiveTime = plugin.config.archiveTime || "00:00";
        templates = plugin.config.templates || [];
    }

    async function refreshFromDisk() {
        showTimePicker = false;
        if (plugin.reloadConfig) {
            await plugin.reloadConfig();
        } else {
            const loaded = await plugin.loadData("config.json");
            plugin.config = {
                profiles: [],
                archiveTime: "00:00",
                lastRunDate: "",
                templates: [],
                ...loaded
            };
        }
        refresh();
    }

    async function save() {
        plugin.config.archiveTime = archiveTime;
        plugin.config.templates = templates;
        plugin.saveData("config.json", plugin.config);
        refresh();
    }

    function addProfile() {
        if (!plugin.config.profiles) plugin.config.profiles = [];
        const newProfile = {
            id: generateUUID(),
            name: t("defaultNewRuleName") + " " + (plugin.config.profiles.length + 1),
            keyword: "",
            completedStatus: t("defaultCompleted"),
            archivedStatus: t("defaultArchived"),
            enabled: true
        };
        plugin.config.profiles = [...plugin.config.profiles, newProfile];
        save();
        expandedId = newProfile.id;
        // Wait for DOM update then scroll
        setTimeout(() => {
            const container = document.querySelector('.profile-container');
            if (container) container.scrollTop = container.scrollHeight;
        }, 50);
    }

    function deleteProfile(id: string) {
        plugin.config.profiles = plugin.config.profiles.filter((p: any) => p.id !== id);
        save();
        if (expandedId === id) expandedId = null;
    }

    function toggleExpand(id: string) {
        if (expandedId === id) expandedId = null;
        else expandedId = id;
    }

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Time Selection Helpers
    function selectHour(h) {
        const parts = archiveTime.split(':');
        archiveTime = `${h}:${parts[1] || '00'}`;
        save();
    }

    function selectMinute(m) {
        const parts = archiveTime.split(':');
        archiveTime = `${parts[0] || '00'}:${m}`;
        save();
    }

    function scrollToOption(type, value) {
        const id = `time-opt-${type}-${value}`;
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({block: "center", behavior: "smooth"});
    }
    
    function toggleTimePicker() {
        showTimePicker = !showTimePicker;
        if (showTimePicker) {
            setTimeout(() => {
                const [h, m] = archiveTime.split(':');
                scrollToOption('h', h);
                scrollToOption('m', m);
            }, 10);
        }
    }

    function generateTemplate(id: string) {
        if (plugin.generateTemplate) plugin.generateTemplate(id);
    }

    async function loadNotebooks() {
        if (!plugin.getNotebooks) return;
        const res = await plugin.getNotebooks();
        notebooks = res?.notebooks || [];
    }

    function addTemplate() {
        const tmpl = {
            id: generateUUID(),
            name: t("templateNewName"),
            period: "day",
            ruleIds: [],
            notebookId: "",
            pathTemplate: "",
            clipboardOnlySections: false,
            titleTemplate: t("templateTitleDefault"),
            sections: [
                { id: generateUUID(), title: t("templateSectionTodo"), statuses: [] },
                { id: generateUUID(), title: t("templateSectionDoing"), statuses: [] },
                { id: generateUUID(), title: t("templateSectionDone"), statuses: [] }
            ]
        };
        templates = [...templates, tmpl];
        save();
        expandedTemplateId = tmpl.id;
    }

    function deleteTemplate(id: string) {
        templates = templates.filter(tpl => tpl.id !== id);
        save();
        if (expandedTemplateId === id) expandedTemplateId = null;
    }

    function toggleTemplateExpand(id: string) {
        if (expandedTemplateId === id) expandedTemplateId = null;
        else {
            expandedTemplateId = id;
            const tpl = templates.find(t => t.id === id);
            if (tpl) refreshStatus(tpl);
        }
    }

    function toggleTemplateRule(tpl, ruleId: string) {
        const list = tpl.ruleIds || [];
        tpl.ruleIds = list.includes(ruleId) ? list.filter(id => id !== ruleId) : [...list, ruleId];
        save();
        refreshStatus(tpl);
    }

    async function refreshStatus(tpl) {
        if (!plugin.getStatusOptions) return;
        statusOptions[tpl.id] = await plugin.getStatusOptions(tpl.ruleIds || []);
    }

    function addSection(tpl) {
        tpl.sections = [...(tpl.sections || []), { id: generateUUID(), title: t("templateSectionNew"), statuses: [] }];
        save();
    }

    function deleteSection(tpl, sid: string) {
        tpl.sections = (tpl.sections || []).filter(s => s.id !== sid);
        save();
    }

    function toggleSectionStatus(section, status: string) {
        const list = section.statuses || [];
        section.statuses = list.includes(status) ? list.filter(s => s !== status) : [...list, status];
        save();
    }
</script>

<style>
    .settings-container {
        padding: 24px;
        display: flex;
        flex-direction: column;
        color: var(--b3-theme-on-background);
        font-family: var(--b3-font-family);
        background-color: var(--b3-theme-background);
        /* Use auto height to fit content, up to dialog limit */
        box-sizing: border-box;
    }
    
    .section-header {
        display: flex;
        align-items: center;
        margin-bottom: 12px;
        padding: 0 4px;
        flex-shrink: 0;
    }
    
    .section-title {
        font-size: 15px; 
        font-weight: 700;
        color: var(--b3-theme-on-background);
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .time-trigger {
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-theme-surface-lighter);
        border-radius: 999px;
        padding: 0 16px;
        font-family: var(--b3-font-family);
        color: var(--b3-theme-on-background);
        transition: all 0.2s;
        height: 36px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        min-width: 90px;
        justify-content: center;
    }
    .time-trigger:hover { 
        border-color: var(--b3-theme-primary-light); 
        background: var(--b3-theme-surface-light);
    }
    .time-trigger.active {
        border-color: var(--b3-theme-primary);
        box-shadow: 0 0 0 3px var(--b3-theme-primary-lightest);
    }

    .time-picker-popover {
        position: absolute;
        top: 60px;
        right: 24px;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-theme-surface-lighter);
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12);
        z-index: 1000;
        display: flex;
        overflow: hidden;
        width: 140px;
        height: 200px;
        animation: fadeIn 0.15s ease-out;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }

    .time-col {
        flex: 1;
        overflow-y: auto;
        padding: 6px;
        scrollbar-width: none; 
    }
    .time-col::-webkit-scrollbar { display: none; }
    
    .time-opt {
        padding: 6px 0;
        text-align: center;
        cursor: pointer;
        font-size: 14px;
        color: var(--b3-theme-on-surface);
        transition: background 0.1s;
        border-radius: 8px; 
        margin: 2px 0;
    }
    .time-opt:hover { background: var(--b3-theme-surface-light); }
    .time-opt.selected {
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        font-weight: bold;
    }

    .backdrop {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        z-index: 999;
    }

    .action-btn {
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        border: none;
        border-radius: 999px;
        padding: 0 18px;
        height: 36px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        box-shadow: none;
    }
    .action-btn:hover {
        opacity: 0.9;
        transform: translateY(-1px);
        box-shadow: none;
    }
    .action-btn:active {
        transform: translateY(0);
        box-shadow: none;
    }
    .action-btn svg { fill: currentColor; }

    /* Scrollable Profile Container - Responsive Flex */
    .profile-container {
        margin-top: 16px;
        /* No fixed max-height, adapts to flex-grow from parent */
        overflow-y: auto;
        overflow-x: hidden;
        padding: 4px;
        scrollbar-width: thin;
        scrollbar-color: var(--b3-theme-surface-lighter) transparent;
        flex: 1; /* Grow to fill space */
    }
    .profile-container::-webkit-scrollbar { width: 6px; }
    .profile-container::-webkit-scrollbar-thumb {
        background-color: var(--b3-theme-surface-lighter);
        border-radius: 3px;
    }
    .profile-container::-webkit-scrollbar-thumb:hover { background-color: var(--b3-theme-primary-light); }

    .card {
        border: 1px solid var(--b3-theme-surface-lighter);
        border-radius: 16px; 
        background: transparent;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        margin-bottom: 12px;
        overflow: hidden;
        position: relative;
    }
    .card:hover { 
        border-color: var(--b3-theme-primary-light); 
        box-shadow: 0 4px 12px rgba(0,0,0,0.03); 
        transform: translateY(-1px);
    }
    .card.expanded { 
        border-color: var(--b3-theme-primary); 
        box-shadow: 0 8px 24px rgba(0,0,0,0.06);
    }

    .card-header {
        padding: 18px 24px;
        display: flex;
        align-items: center;
        cursor: pointer;
        user-select: none;
        background: transparent;
    }
    
    .card-content {
        padding: 10px 24px 24px 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        border-top: 1px solid var(--b3-border-color);
        background: transparent;
    }

    .input-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .input-label {
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        font-weight: 600;
        margin-left: 2px;
    }
    .modern-input {
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        padding: 10px 14px;
        width: 100%;
        box-sizing: border-box;
        transition: all 0.2s;
        font-size: 14px;
        color: var(--b3-theme-on-background);
    }
    .modern-input:focus {
        border-color: var(--b3-theme-primary);
        outline: none;
        box-shadow: 0 0 0 3px var(--b3-theme-primary-lightest);
    }

    .chevron {
        transition: transform 0.2s ease;
        opacity: 0.5;
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        color: var(--b3-theme-on-surface);
    }
    .expanded .chevron { transform: rotate(90deg); opacity: 1; color: var(--b3-theme-primary); }

    .tag-preview {
        font-size: 12px;
        background: var(--b3-theme-primary-lightest);
        color: var(--b3-theme-primary);
        padding: 4px 10px;
        border-radius: 6px;
        margin-left: 10px;
        font-weight: 600;
    }

    .icon-btn {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        cursor: pointer;
        opacity: 0.5;
        transition: all 0.2s;
        margin-left: 4px;
        color: var(--b3-theme-on-surface);
    }
    .icon-btn:hover {
        background: var(--b3-theme-error-lightest);
        color: var(--b3-theme-error);
        opacity: 1;
    }
    .icon-btn svg { width: 16px; height: 16px; }

    .info-footer {
        margin-top: 16px;
        padding: 24px;
        background: transparent;
        border-radius: 16px;
        border: 1px solid var(--b3-theme-surface-lighter);
        font-size: 13.5px;
        color: var(--b3-theme-on-surface);
        flex-shrink: 0;
    }
    .info-footer ul { margin: 10px 0 0 20px; padding: 0; line-height: 1.8; opacity: 0.8; }
    .info-footer li { margin-bottom: 4px; }

    .switch-container {
        display: inline-block;
        width: 44px;
        height: 24px;
        position: relative;
    }
    .switch-input { opacity: 0; width: 0; height: 0; position: absolute; }
    .switch-track {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: var(--b3-theme-surface-lighter);
        border: 1px solid var(--b3-border-color);
        border-radius: 24px;
        transition: background-color 0.3s;
        cursor: pointer;
    }
    .switch-thumb {
        position: absolute;
        content: "";
        height: 18px; width: 18px;
        left: 2px; bottom: 2px;
        background-color: white;
        border-radius: 50%;
        transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .switch-input:checked + .switch-track {
        background-color: var(--b3-theme-primary);
        border-color: var(--b3-theme-primary);
    }
    .switch-input:checked + .switch-track .switch-thumb { transform: translateX(20px); }

    .fn__flex-1 { flex: 1; }
    .fn__flex { display: flex; }

    .dot-check {
        appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1.5px solid var(--b3-border-color);
        background: transparent;
        display: inline-block;
        position: relative;
        cursor: pointer;
    }
    .dot-check:checked {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        box-shadow: inset 0 0 0 2px var(--b3-theme-background);
    }
    .status-dot:hover .dot-check {
        border-color: var(--b3-theme-primary-light);
    }
</style>

<!-- Backdrop -->
{#if showTimePicker}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="backdrop" on:click={() => showTimePicker = false}></div>
{/if}

<div class="settings-container">
    
    <!-- Global Config -->
    <div class="section-header">
        <div class="section-title">
            <svg style="width:18px;height:18px"><use xlink:href="#iconCalendar"></use></svg>
            {t("globalArchiveTime")}
        </div>
        <div class="fn__flex-1"></div>
        <button class="action-btn" style="background-color: transparent; color: var(--b3-theme-on-surface); box-shadow: none; border: 1px solid var(--b3-theme-surface-lighter); margin-right: 12px;" on:click={() => plugin.undoArchiveNow()}>
            <svg style="width:14px;height:14px"><use xlink:href="#iconUndo"></use></svg>
            {t("undoArchive")}
        </button>
        <button class="action-btn" style="margin-right: 32px;" on:click={() => plugin.archiveNow()}>
            <svg style="width:14px;height:14px"><use xlink:href="#iconFiles"></use></svg>
            {t("archiveNow")}
        </button>
        
        <!-- Custom Time Trigger -->
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div class="time-trigger" class:active={showTimePicker} on:click={toggleTimePicker}>
            {archiveTime}
            <svg style="width:14px;height:14px;opacity:0.6;"><use xlink:href="#iconClock"></use></svg>
        </div>

        {#if showTimePicker}
            <div class="time-picker-popover">
                <div class="time-col">
                    {#each hours as h}
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <div id={`time-opt-h-${h}`} class="time-opt" class:selected={archiveTime.startsWith(h)} on:click={() => selectHour(h)}>
                            {h}
                        </div>
                    {/each}
                </div>
                <div style="width:1px;background:var(--b3-theme-surface-lighter);"></div>
                <div class="time-col">
                    {#each minutes as m}
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <div id={`time-opt-m-${m}`} class="time-opt" class:selected={archiveTime.endsWith(m)} on:click={() => selectMinute(m)}>
                            {m}
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </div>

    <!-- Profiles -->
    <!-- Removed flex:1 to prevent auto-grow. Now relies on container max-height. -->
    <div style="margin-top: 20px; display: flex; flex-direction: column;">
        <div class="section-header">
            <div class="section-title">
                <svg style="width:18px;height:18px"><use xlink:href="#iconSettings"></use></svg>
                {t("archiveRuleList")}
            </div>
            <div class="fn__flex-1"></div>
            <button class="action-btn" on:click={addProfile}>
                <svg style="width:14px;height:14px"><use xlink:href="#iconAdd"></use></svg>
                {t("addRule")}
            </button>
        </div>

        <div class="profile-container">
            {#each profiles as profile (profile.id)}
                <div class="card" class:expanded={expandedId === profile.id} style="opacity: {profile.enabled ? 1 : 0.75}">
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <div class="card-header" on:click={() => toggleExpand(profile.id)}>
                        <div class="chevron">
                            <svg style="width:12px;height:12px"><use xlink:href="#iconRight"></use></svg>
                        </div>
                        
                        <div class="fn__flex-1" style="margin-left: 14px; display: flex; align-items: center;">
                            <span style="font-weight: 600; font-size: 15px; color: var(--b3-theme-on-surface);">{profile.name || t("unnamedRule")}</span>
                            {#if profile.keyword}
                                <span class="tag-preview">{profile.keyword}</span>
                            {/if}
                        </div>
                        
                         <div class="fn__flex-center" style="margin-right: 20px;" on:click|stopPropagation>
                            <label class="switch-container" title={profile.enabled ? t("enabled") : t("disabled")}>
                                <input class="switch-input" type="checkbox" bind:checked={profile.enabled} on:change={save}>
                                <span class="switch-track">
                                    <span class="switch-thumb"></span>
                                </span>
                            </label>
                        </div>

                        <div class="icon-btn" on:click|stopPropagation={() => deleteProfile(profile.id)} title={t("deleteRule")}>
                            <svg><use xlink:href="#iconTrashcan"></use></svg>
                        </div>
                    </div>

                    {#if expandedId === profile.id}
                        <div class="card-content">
                            <div class="input-group">
                                <div class="input-label">{t("ruleNameLabel")}</div>
                                <input class="modern-input" type="text" bind:value={profile.name} placeholder={t("ruleNamePlaceholder")} on:change={save}/>
                            </div>

                            <div class="input-group">
                                <div class="input-label">{t("keywordLabel")}</div>
                                <input class="modern-input" type="text" bind:value={profile.keyword} placeholder={t("keywordPlaceholder")} on:change={save}/>
                            </div>

                            <div class="fn__flex" style="gap: 20px;">
                                <div class="input-group fn__flex-1">
                                    <div class="input-label">{t("completedStatusLabel")}</div>
                                    <input class="modern-input" type="text" bind:value={profile.completedStatus} placeholder={t("completedStatusPlaceholder")} on:change={save}/>
                                </div>
                                <div class="input-group fn__flex-1">
                                    <div class="input-label">{t("archivedStatusLabel")}</div>
                                    <input class="modern-input" type="text" bind:value={profile.archivedStatus} placeholder={t("archivedStatusPlaceholder")} on:change={save}/>
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}

            {#if profiles.length === 0}
                <div style="text-align: center; padding: 48px; color: var(--b3-theme-on-surface-light); border: 2px dashed var(--b3-border-color); border-radius: 16px;">
                    {t("noRulesTip")}
                </div>
            {/if}
        </div>
    </div>

    <!-- Templates -->
    <div style="margin-top: 24px; display: flex; flex-direction: column;">
        <div class="section-header">
            <div class="section-title">
                <svg style="width:18px;height:18px"><use xlink:href="#iconCalendar"></use></svg>
                {t("templateListTitle")}
            </div>
            <div class="fn__flex-1"></div>
            <button class="action-btn" style="width: 132px; justify-content: center;" on:click={addTemplate}>
                <svg style="width:14px;height:14px"><use xlink:href="#iconAdd"></use></svg>
                {t("templateAdd")}
            </button>
        </div>

        <div class="profile-container">
            {#each templates as tpl (tpl.id)}
                <div class="card" class:expanded={expandedTemplateId === tpl.id}>
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <div class="card-header" on:click={() => toggleTemplateExpand(tpl.id)}>
                        <div class="chevron">
                            <svg style="width:12px;height:12px"><use xlink:href="#iconRight"></use></svg>
                        </div>
                        <div class="fn__flex-1" style="margin-left: 14px; display: flex; align-items: center;">
                            <span style="font-weight: 600; font-size: 15px; color: var(--b3-theme-on-surface);">{tpl.name}</span>
                            <span class="tag-preview">{t(`templatePeriod_${tpl.period || 'none'}`)}</span>
                        </div>
                        <button class="action-btn" style="height: 28px; padding: 0 12px; margin-right: 8px;" on:click|stopPropagation={() => generateTemplate(tpl.id)}>
                            {t("templateGenerate")}
                        </button>
                        <div class="icon-btn" on:click|stopPropagation={() => deleteTemplate(tpl.id)} title={t("deleteRule")}>
                            <svg><use xlink:href="#iconTrashcan"></use></svg>
                        </div>
                    </div>

                    {#if expandedTemplateId === tpl.id}
                        <div class="card-content">
                            <div class="input-group">
                                <div class="input-label">{t("templateNameLabel")}</div>
                                <input class="modern-input" type="text" bind:value={tpl.name} on:change={save}/>
                            </div>
                            <div class="input-group">
                                <div class="input-label">{t("templatePeriodLabel")}</div>
                                <select class="modern-input" bind:value={tpl.period} on:change={save}>
                                    <option value="none">{t("templatePeriod_none")}</option>
                                    <option value="day">{t("templatePeriod_day")}</option>
                                    <option value="week">{t("templatePeriod_week")}</option>
                                    <option value="month">{t("templatePeriod_month")}</option>
                                    <option value="year">{t("templatePeriod_year")}</option>
                                </select>
                            </div>
                            <div class="input-group">
                                <div class="input-label">{t("templateRuleLabel")}</div>
                                <div class="fn__flex" style="flex-wrap: wrap; gap: 12px;">
                                    {#each profiles as p}
                                        <label class="fn__flex" style="align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--b3-border-color); border-radius: 999px; background: var(--b3-theme-background);">
                                            <input type="checkbox" checked={tpl.ruleIds?.includes(p.id)} on:change={() => toggleTemplateRule(tpl, p.id)} />
                                            <span style="font-size: 13px;">{p.name || p.keyword || p.id}</span>
                                        </label>
                                    {/each}
                                    {#if profiles.length === 0}
                                        <div style="font-size: 13px; color: var(--b3-theme-on-surface-light);">{t("reportNoProfileTip")}</div>
                                    {/if}
                                </div>
                            </div>
                            <div class="input-group">
                                <div class="input-label">{t("templateNotebookLabel")}</div>
                                <select class="modern-input" bind:value={tpl.notebookId} on:change={save}>
                                    <option value="">{t("templateNotebookAuto")}</option>
                                    {#each notebooks as nb}
                                        <option value={nb.id}>{nb.name}</option>
                                    {/each}
                                </select>
                            </div>
                            <div class="input-group">
                                <div class="input-label">{t("templatePathLabel")}</div>
                                <input class="modern-input" type="text" bind:value={tpl.pathTemplate} placeholder={t("templatePathPlaceholder")} on:change={save}/>
                            </div>
                            <div class="input-group">
                                <div class="input-label">{t("reportClipboardOnlySections")}</div>
                                <label class="switch-container" title={tpl.clipboardOnlySections ? t("enabled") : t("disabled")}>
                                    <input class="switch-input" type="checkbox" bind:checked={tpl.clipboardOnlySections} on:change={save}>
                                    <span class="switch-track">
                                        <span class="switch-thumb"></span>
                                    </span>
                                </label>
                            </div>
                            <div class="input-group">
                                <div class="input-label">{t("templateTitleLabel")}</div>
                                <input class="modern-input" type="text" bind:value={tpl.titleTemplate} placeholder={t("templateTitlePlaceholder")} on:change={save}/>
                            </div>

                            <div class="input-group">
                                <div class="input-label">{t("templateSectionList")}</div>
                                <div class="fn__flex" style="flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
                                    {#if (statusOptions[tpl.id] || []).length === 0}
                                        <div style="font-size: 13px; color: var(--b3-theme-on-surface-light);">{t("templateStatusEmpty")}</div>
                                    {:else}
                                        {#each statusOptions[tpl.id] as st}
                                            <span class="tag-preview">{st}</span>
                                        {/each}
                                    {/if}
                                </div>
                                {#each tpl.sections as sec (sec.id)}
                                    <div class="card" style="margin-bottom: 12px;">
                                        <div class="card-content">
                                            <div class="input-group">
                                                <div class="input-label">{t("templateSectionTitleLabel")}</div>
                                                <input class="modern-input" type="text" bind:value={sec.title} on:change={save}/>
                                            </div>
                                            <div class="input-group">
                                                <div class="input-label">{t("templateSectionStatusLabel")}</div>
                                                <div class="fn__flex" style="flex-wrap: wrap; gap: 10px;">
                                                    {#each (statusOptions[tpl.id] || []) as st}
                                                        <label class="fn__flex status-dot" style="align-items: center; gap: 6px; padding: 4px 8px; border: 1px solid var(--b3-border-color); border-radius: 999px; background: var(--b3-theme-background);">
                                                            <input class="dot-check" type="checkbox" checked={(sec.statuses || []).includes(st)} on:change={() => toggleSectionStatus(sec, st)} />
                                                            <span style="font-size: 12px;">{st}</span>
                                                        </label>
                                                    {/each}
                                                </div>
                                            </div>
                                            <div class="fn__flex" style="justify-content: flex-end;">
                                                <div class="icon-btn" on:click={() => deleteSection(tpl, sec.id)} title={t("templateSectionDelete")}>
                                                    <svg><use xlink:href="#iconTrashcan"></use></svg>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                {/each}
                                <div class="fn__flex" style="justify-content: flex-start;">
                                    <button class="action-btn" style="width: 132px; justify-content: center;" on:click={() => addSection(tpl)}>
                                        {t("templateSectionAdd")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    </div>

    <div class="info-footer">
        <div style="font-weight: 700; color: var(--b3-theme-primary); display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px;">
            <svg style="width:16px;height:16px;"><use xlink:href="#iconInfo"></use></svg>
            {t("usageTipTitle")}
        </div>
        <ul>
            <li><strong>{t("usageTipGlobal")}</strong>：{t("usageTipGlobalDesc")}</li>
            <li><strong>{t("usageTipMatch")}</strong>：{t("usageTipMatchDesc")}</li>
            <li><strong>{t("usageTipStatus")}</strong>：{t("usageTipStatusDesc")}</li>
            <li><strong>{t("usageTipReport")}</strong>：{t("usageTipReportDesc")}</li>
        </ul>
    </div>
</div>
