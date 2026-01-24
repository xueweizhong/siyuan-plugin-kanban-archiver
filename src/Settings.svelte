<script lang="ts">
    import { onMount, tick } from "svelte";
    export let plugin: any;

    let profiles = [];
    let archiveTime = "00:00";
    let expandedId = null;

    // Time Picker State
    let showTimePicker = false;
    const hours = Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0'));
    const minutes = Array.from({length: 60}, (_, i) => i.toString().padStart(2, '0'));

    onMount(() => {
        refresh();
        if (plugin.config.profiles && plugin.config.profiles.length === 1) {
            expandedId = plugin.config.profiles[0].id;
        }
    });

    function refresh() {
        profiles = plugin.config.profiles || [];
        archiveTime = plugin.config.archiveTime || "00:00";
    }

    async function save() {
        plugin.config.archiveTime = archiveTime;
        plugin.saveData("config.json", plugin.config);
        refresh();
    }

    function addProfile() {
        if (!plugin.config.profiles) plugin.config.profiles = [];
        const newProfile = {
            id: generateUUID(),
            name: "新规则 " + (plugin.config.profiles.length + 1),
            keyword: "",
            completedStatus: "已完成",
            archivedStatus: "归档",
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
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    }
    .action-btn:hover {
        opacity: 0.9;
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    }
    .action-btn:active {
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
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
        background: var(--b3-theme-surface);
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
        background: var(--b3-theme-surface);
    }
    
    .card-content {
        padding: 10px 24px 24px 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        border-top: 1px solid var(--b3-border-color);
        background: var(--b3-theme-surface-light);
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
            全局定时归档
        </div>
        <div class="fn__flex-1"></div>
        
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
                归档规则列表
            </div>
            <div class="fn__flex-1"></div>
            <button class="action-btn" on:click={addProfile}>
                <svg style="width:14px;height:14px"><use xlink:href="#iconAdd"></use></svg>
                新建规则
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
                            <span style="font-weight: 600; font-size: 15px; color: var(--b3-theme-on-surface);">{profile.name || "未命名规则"}</span>
                            {#if profile.keyword}
                                <span class="tag-preview">{profile.keyword}</span>
                            {/if}
                        </div>
                        
                         <div class="fn__flex-center" style="margin-right: 20px;" on:click|stopPropagation>
                            <label class="switch-container" title={profile.enabled ? "已启用" : "已禁用"}>
                                <input class="switch-input" type="checkbox" bind:checked={profile.enabled} on:change={save}>
                                <span class="switch-track">
                                    <span class="switch-thumb"></span>
                                </span>
                            </label>
                        </div>

                        <div class="icon-btn" on:click|stopPropagation={() => deleteProfile(profile.id)} title="删除规则">
                            <svg><use xlink:href="#iconTrashcan"></use></svg>
                        </div>
                    </div>

                    {#if expandedId === profile.id}
                        <div class="card-content">
                            <div class="input-group">
                                <div class="input-label">规则显示名称</div>
                                <input class="modern-input" type="text" bind:value={profile.name} placeholder="例如：主工作项目看板" on:change={save}/>
                            </div>

                            <div class="input-group">
                                <div class="input-label">文档标题关键词</div>
                                <input class="modern-input" type="text" bind:value={profile.keyword} placeholder="输入包含在文档标题中的词，例如 '工作'" on:change={save}/>
                            </div>

                            <div class="fn__flex" style="gap: 20px;">
                                <div class="input-group fn__flex-1">
                                    <div class="input-label">待归档状态 (源)</div>
                                    <input class="modern-input" type="text" bind:value={profile.completedStatus} placeholder="已完成" on:change={save}/>
                                </div>
                                <div class="input-group fn__flex-1">
                                    <div class="input-label">目标归档状态</div>
                                    <input class="modern-input" type="text" bind:value={profile.archivedStatus} placeholder="归档" on:change={save}/>
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}

            {#if profiles.length === 0}
                <div style="text-align: center; padding: 48px; color: var(--b3-theme-on-surface-light); border: 2px dashed var(--b3-border-color); border-radius: 16px;">
                    暂时没有规则，请点击右上方按钮新建。
                </div>
            {/if}
        </div>
    </div>

    <div class="info-footer">
        <div style="font-weight: 700; color: var(--b3-theme-primary); display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px;">
            <svg style="width:16px;height:16px;"><use xlink:href="#iconInfo"></use></svg>
            使用提示
        </div>
        <ul>
            <li><strong>全局定时</strong>：所有“已启用”的规则都会在上方设定的时间点自动执行。</li>
            <li><strong>精准匹配</strong>：插件仅对标题包含“关键词”的文档生效。</li>
            <li><strong>状态映射</strong>：请确保属性视图（AV）中存在对应的状态选项名称。</li>
        </ul>
    </div>
</div>
