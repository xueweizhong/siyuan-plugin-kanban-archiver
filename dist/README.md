### Kanban Archiver

This is a plugin designed for [SiYuan Note](https://b3log.org/siyuan/), **specifically for use with SiYuan's native Database (Attribute View)**. It can automatically or manually scan specified Kanban boards / Table views and move tasks with the "Completed" status to the "Archived" status, keeping your data clean.

[简体中文 README](README_zh_CN.md)

![Banner](./banner.png)

## Features

*   **Auto Archive**: Automatically performs archiving operations at your scheduled time (e.g., daily at 00:00).
*   **Manual Archive**: One-click immediate archiving whenever needed.
*   **Startup Catch-up**: If the scheduled time is missed (e.g., software was closed), it automatically catches up upon the next launch.
*   **Safe Undo**: Supports undoing the last archive operation (Regret Medicine), with persistent history records.
*   **Flexible Configuration**: Supports custom Kanban keywords, completed status names, and archive status names.
*   **Smart Recognition**: Automatically identifies Document Attribute Views; supports multiple views.

## Usage Guide

### 1. Configure Plugin
After installing the plugin, go to the settings interface. v0.2.0 introduced **Multi-Profile Configuration**, allowing you to create different archiving rules for various boards.

Click "New Rule" and fill in:
*   **Rule Name**: A name for you to identify the rule (e.g., `Work Board Config`).
*   **Kanban Keyword**: The keyword that must be contained in the document title (e.g., `My Work Board`).
*   **Completed Status Name**: The source status (e.g., `Done`).
*   **Archive Status Name**: The target status (e.g., `Archived`).

**Auto Archive Time**: Global setting, the specific time to check daily (e.g., `00:00`). All rules share this trigger time.

### 2. Auto Check
The plugin checks your boards automatically at the set time (e.g., `00:00`).
*   If the current time matches the scheduled time and it hasn't run today, it runs.
*   If SiYuan Note is kept open, it checks every minute and triggers when the time is reached.

### 3. Manual Execution

![Operation](./操作.png)

Besides waiting for auto-archiving, you can manually trigger it:
*   **Top Bar Menu**: Click/Hover on the plugin icon in the top region:
    *   **Archive Now**: Immediately run an archive operation.
    *   **Undo Archive**: Undo the last archive operation (supports multi-level undo).
*   **Command Palette**: Open Command Palette (`⌥⇧P` / `Alt+Shift+P`), search and execute `Archive Kanban Tasks Now` or `Undo Archive`.

### 4. Undo Mechanism & History

The plugin has a built-in safe "Regret Medicine" mechanism:
*   **Undo Scope**: Only undoes tasks involved in the **last** operation, restoring their status to "Completed".
*   **Persistence**: Operation history is saved locally, so you can still undo after restarting the software.
*   **Cleanup Policy**: To save space, the system automatically cleans up history records older than **30 entries** or **7 days**.

## Notes

*   **Data Validity**: If you manually delete a task block after archiving, the undo operation may report failure (this is normal).
*   Please ensure the configured status names match the option names in your document Attribute View exactly (case-sensitive).
*   Auto archive requires SiYuan Note to be running. If the software is not running at the scheduled time, it will check at the next startup (current logic is primarily based on daily fixed-point triggering).

## Changelog

[View Changelog (CHANGELOG.md)](CHANGELOG.md)

---
*Note: This plugin was created with AI assistance*
