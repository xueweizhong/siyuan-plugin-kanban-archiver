# Kanban Workflow

Kanban Workflow is a unified plugin for SiYuan Attribute View / Database, combining **auto-archiving** and **report templates** into one reliable workflow.

## Features

- Auto archive by schedule
- One-click archive + undo last archive
- Multiple rules for different Kanban documents
- Report templates with custom titles, sections, and paths
- Multi-board summary grouped by board
- Status mapping by reading AV status options

## Usage (Detailed)

### 1. Archive Rules
Add rules in Settings:
- **Rule name** (for identification)
- **Document keyword** (to locate the Kanban doc)
- **Source status** (e.g. Done)
- **Target status** (e.g. Archived)

Set a global schedule to auto-run archiving.

### 2. Report Templates
In “Report Templates”:
- Add a template
- Choose **Filter Period** (none/day/week/month/year)
- Select **Source Rules (multi-select)**
- Choose **Target Notebook** (by name)
- Set **Output Path Template** (optional, supports `{YYYY}/{MM}/{WW}/{date}`)
- Set **Title Template** (supports `{date}`)
- Map statuses to sections

### 3. Generate Reports
Entries:
- Topbar menu → `Generate: Template Name`
- Template card → “Generate”
- Command palette → `Generate: Template Name`

Results:
- Writes to target path
- Repeated generation replaces previous section
- Copies to clipboard (rich text + plain text)

## Example Scenario

Assume you have a Kanban document named “My Work Board” with statuses: Todo, Doing, Done, Archived.

**Goal**: Every Friday, generate a weekly report of “Done/Archived”, and auto-archive all “Done”.

**Steps**:
1. Create an archive rule  
   - Rule name: My Work Board  
   - Document keyword: My Work Board  
   - Source status: Done  
   - Target status: Archived  
2. Create a report template  
   - Template name: Weekly Report  
   - Filter period: Weekly  
   - Source rules: select “My Work Board”  
   - Target notebook: “Work Logs”  
   - Output path: `Weekly/{YYYY}/{WW}`  
   - Title template: `Weekly Report ({date})`  
   - Sections mapping:  
     - “Todo” → Todo  
     - “Doing” → Doing  
     - “Done” → Done, Archived  
3. On Friday, click “Generate: Weekly Report”. It will:
   - Create the report and group items by section  
   - Copy it to clipboard  
   - Auto-archive Done items on schedule

## Notes

- Rule keyword should uniquely match the Kanban document title
- Status names must match AV options exactly
- When using week/month/year filters, only “done/archived” statuses are filtered by time

## Changelog

See: CHANGELOG.md

## ☕️ Buy Me Milk Tea

This plugin is free and open source. If it helps you, consider buying me a milk tea! 🥤

(Voluntary, does not affect any features.)

<img src="https://raw.githubusercontent.com/xueweizhong/siyuan-plugin-kanban-archiver/main/mumamuma.png" alt="Donate" width="300" />

---
*Note: Built with AI assistance.*
