---
name: whatsapp:extract-members
description: Extract all community-level members from a WhatsApp Web community into a CSV file using agent-browser
argument-hint: "<community_name> [output_path]"
---

# WhatsApp Community Member Extraction

Extract all community-level members from a WhatsApp Web community into a CSV file with columns: `phone`, `display_name`, `duplicate`.

This skill uses `agent-browser` (Vercel Labs Rust CLI) to drive a real Chrome session via CDP. The admin authenticates by scanning a QR code with their phone. The extraction is **read-only** -- no messages are sent, no members are added or removed.

## Prerequisites

1. **agent-browser** must be installed globally:
   ```bash
   npm install -g agent-browser && agent-browser install
   ```
2. Chrome must be available (agent-browser manages its own Chrome instance).
3. The user must be a **WhatsApp community admin** to see the full member list.

Verify agent-browser is installed before proceeding:
```bash
agent-browser --version
```
If the command fails, instruct the user to install it with the command above and retry.

## Argument Handling

This skill accepts two arguments:

| Argument         | Required | Default                        | Description                          |
| ---------------- | -------- | ------------------------------ | ------------------------------------ |
| `community_name` | Yes      | (prompt user if omitted)       | Exact name of the WhatsApp community |
| `output_path`    | No       | User's Downloads folder        | Full path or directory for CSV output |

**Community name:** If the user did not provide a community name, ask them before proceeding. Use the exact name as it appears in WhatsApp.

**Output path resolution:**
- If `output_path` is provided, use it directly (if it is a directory, append the filename).
- If omitted, detect the OS default Downloads folder:
  - **Windows:** `$USERPROFILE/Downloads`
  - **macOS/Linux:** `$HOME/Downloads`
- **Filename format:** `whatsapp-members-{slug}-{YYYY-MM-DD}.csv`
  - `{slug}` = community name lowercased, spaces replaced with hyphens, non-alphanumeric characters removed
  - `{YYYY-MM-DD}` = current date

Determine the output path early and confirm it to the user before starting extraction.

## Extraction Workflow

Follow these steps sequentially. Use the `Bash` tool to run agent-browser commands and the `Read` tool to view screenshots.

### Step 1: Open WhatsApp Web

```bash
agent-browser open "https://web.whatsapp.com"
```

Wait 3 seconds for the page to load, then take a screenshot:

```bash
agent-browser wait 3000
agent-browser screenshot "$TEMP/wa-qr.png"
```

Show the screenshot to the user using the Read tool and tell them:

> "Please scan the QR code with your WhatsApp mobile app. Say **done** when you are logged in."

**STOP here and wait for the user to confirm they have scanned the QR code.** Do NOT proceed until the user confirms.

After confirmation, wait for the session to load and verify login:

```bash
agent-browser wait 3000
agent-browser snapshot -i
```

Check the snapshot output for chat list elements (e.g., conversation entries, a search bar, "Chats" heading). If login indicators are not present, take a screenshot and ask the user to verify. If WhatsApp shows "Use phone to verify" or a multi-device confirmation prompt, tell the user to approve it on their phone, wait, and retry.

### Step 2: Navigate to the Community

Take a snapshot to see the current state:

```bash
agent-browser snapshot -i
```

Find the search input in the accessibility tree. It is typically near the top of the chat list. Click it and type the community name:

```bash
agent-browser click @eN        # Replace @eN with the search input ref from snapshot
agent-browser fill @eN "{community_name}"
agent-browser wait 2000
```

Take a snapshot to find the community in search results:

```bash
agent-browser snapshot -i
```

Look for an entry whose text matches the community name. Click it:

```bash
agent-browser click @eN        # Replace @eN with the community entry ref
agent-browser wait 2000
```

Take a snapshot to verify the community view is open. You should see the community header with the community name and a description or member count.

If the community is not found in search results:
- Clear the search and try again with a slightly different query (e.g., partial name).
- If still not found, ask the user to verify the exact community name as it appears in WhatsApp.

### Step 3: Open the Community Members List

Click the community header/name area at the top of the chat to open the community info panel:

```bash
agent-browser snapshot -i
```

Identify the community name or header element in the accessibility tree and click it:

```bash
agent-browser click @eN        # The community header/title area
agent-browser wait 2000
agent-browser snapshot -i
```

In the info panel, look for a "Members" or "Miembros" section (the label depends on the user's WhatsApp language setting -- handle both English and Spanish). There should be a member count displayed (e.g., "45 members" or "45 miembros").

Click on the members count or the members section to open the full member list:

```bash
agent-browser click @eN        # The members count/link
agent-browser wait 2000
agent-browser snapshot -i
```

Verify the member list is now visible. You should see individual member entries with names and possibly phone numbers.

### Step 4: Extract All Members (Scroll Loop)

This is the critical extraction step. The member list is likely **virtualized** -- WhatsApp Web only renders members currently visible in the scroll viewport. You must scroll through the entire list to capture everyone.

**Strategy:** Repeatedly snapshot, extract visible members, scroll down, and repeat until no new members appear across multiple consecutive cycles.

Initialize an empty collection to store extracted members (track in-memory as you go).

**Extraction loop:**

```
consecutive_no_new = 0
all_members = {}  (keyed by display_name+phone to deduplicate)

while consecutive_no_new < 3:
    1. Run: agent-browser snapshot -i
    2. Parse the accessibility tree output for member entries.
       - Each member typically appears as a list item with:
         - A display name (the primary text)
         - A phone number (subtitle text, may be absent if the user has hidden it)
       - Extract both fields for each visible member.
    3. Count how many NEW members were found (not already in all_members).
    4. If new_count == 0:
         consecutive_no_new += 1
       Else:
         consecutive_no_new = 0
         Add new members to all_members.
    5. Scroll down within the member list container:
       - Identify the scrollable container ref from the snapshot (the list/panel holding member entries).
       - Run: agent-browser scroll down @eN  (where @eN is the scrollable container)
       - If no specific scrollable ref is identifiable, use: agent-browser scroll down
    6. Wait for new members to render:
       Run: agent-browser wait 1500
```

**Important notes for extraction:**
- Phone numbers appear in various formats (e.g., `+1 787 555 1234`, `+52 55 1234 5678`, `787-555-1234`). Extract them exactly as displayed.
- Some members may show only a display name with no visible phone number. Record these with an empty phone field.
- Community-level members ONLY. Do NOT drill into sub-groups or channels within the community.
- If the scrollable member list container has a specific `@ref`, always scroll THAT element rather than the whole page.
- If scrolling seems stuck (many consecutive no-new cycles but total count seems low compared to the member count shown in the header), try:
  - Scrolling more aggressively: run `agent-browser scroll down @eN` multiple times in rapid succession.
  - Taking a screenshot to visually debug the state.
  - Scrolling up first, then back down.

After the loop completes, report the total number of members extracted.

### Step 5: Close the Browser

Always close the browser session when done (or on error):

```bash
agent-browser close
```

## Data Processing

After extraction is complete, process the collected member data:

### Phone Number Normalization

For each phone number:
1. Strip spaces, dashes, parentheses, and dots.
2. Preserve the `+` prefix and country code (e.g., `+17875551234`).
3. If no `+` prefix exists, keep the number as-is (do not guess the country code).

### Duplicate Detection

1. Group members by their normalized phone number.
2. If a phone number appears more than once, mark ALL entries with that phone as `duplicate = true`.
3. Members with empty phone numbers are never marked as duplicates of each other.

### Sorting

Sort the final list alphabetically by `display_name` (case-insensitive).

## CSV Output

Write the CSV file using the **Write tool** (NOT agent-browser).

**CSV format:**
```csv
phone,display_name,duplicate
+17875551234,Ana Rivera,false
+17875559876,Carlos Lopez,true
+17875559876,Carlos L.,true
,Hidden User,false
```

**Rules:**
- Header row: `phone,display_name,duplicate`
- Quote any field that contains commas using double quotes.
- `duplicate` column: `true` or `false`.
- Empty phone numbers: leave the field empty (e.g., `,Display Name,false`).

Write the file to the output path determined during argument handling.

## Post-Extraction Report

After writing the CSV, report to the user:

```
Extraction complete.
- Total members extracted: {total}
- Members with phone numbers: {with_phone}
- Members without phone numbers: {without_phone}
- Unique phone numbers: {unique_phones}
- Duplicate phone numbers found: {duplicate_count}
- CSV saved to: {output_path}
```

## Error Handling

| Error                                 | Action                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| agent-browser not installed           | Tell user to run `npm install -g agent-browser && agent-browser install`                       |
| QR code not visible                   | Wait longer, retry screenshot, ask user to refresh WhatsApp Web                                |
| "Use phone to verify" prompt          | Tell user to approve on their phone, wait 5 seconds, retry snapshot                           |
| Community not found in search         | Ask user to verify the exact community name; try partial name search                          |
| Member list fails to load             | Wait 5 seconds, retry snapshot; if still empty, click back and re-enter community info        |
| Scrolling yields no new members early | Try aggressive scrolling, scroll the specific container ref, take a debug screenshot           |
| Unexpected page state                 | Take a screenshot, show it to the user, ask for guidance                                       |
| Any unrecoverable error               | Always run `agent-browser close` before stopping                                               |

## Important Notes

- This skill performs **READ-ONLY** operations. No messages are sent, no members are added or removed.
- WhatsApp Web uses the admin's real account. Standard WhatsApp Terms of Service considerations apply.
- The accessibility tree from agent-browser is token-efficient (~200-400 tokens per snapshot), but large member lists may require many scroll iterations. This is expected.
- Extract **community-level members only**. Do NOT navigate into sub-groups or channels within the community.
- If the member list container has a scrollable `@ref`, scroll THAT element specifically rather than the whole page.
- The extraction may take several minutes for communities with hundreds of members due to the scroll-and-snapshot cycle.
- Phone number formats vary by country and user settings. The skill extracts numbers exactly as displayed and normalizes them for duplicate detection only.
