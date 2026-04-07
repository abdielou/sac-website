---
name: whatsapp:extract-members
description: Extract all community-level members from a WhatsApp Web community into a CSV file using agent-browser
argument-hint: "[output_path]"
---

# WhatsApp Community Member Extraction

Extract all community-level members from a WhatsApp Web community into a CSV file with columns: `phone`, `display_name`.

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

This skill accepts one optional argument:

| Argument         | Required | Default                        | Description                          |
| ---------------- | -------- | ------------------------------ | ------------------------------------ |
| `output_path`    | No       | User's Downloads folder        | Full path or directory for CSV output |

**Community name:** Always use `Sociedad de Astronomía del Caribe`. This is hardcoded — do not ask the user.

**Output path resolution:**
- If `output_path` is provided, use it directly (if it is a directory, append the filename).
- If omitted, detect the OS default Downloads folder:
  - **Windows:** `$USERPROFILE/Downloads`
  - **macOS/Linux:** `$HOME/Downloads`
- **Filename format:** `whatsapp-members-{slug}-{YYYY-MM-DD}.csv`
  - `{slug}` = community name lowercased, spaces replaced with hyphens, non-alphanumeric characters removed
  - `{YYYY-MM-DD}` = current date

Determine the output path early and confirm it to the user before starting extraction.

## Sub-Channel Flagging

Always extract members from the **"Comité de Viajes Astronómicos"** sub-channel and flag them in the CSV with a `sub_channels` column. Members found in this sub-channel get the value `viajes_astronomicos` in the `sub_channels` column. This is hardcoded — do not ask the user.

## Extraction Workflow

Follow these steps sequentially. Use the `Bash` tool to run agent-browser commands and the `Read` tool to view screenshots.

### Step 1: Open WhatsApp Web

IMPORTANT: agent-browser runs **headless by default**. You MUST use `--headed` so the user can see the browser and scan the QR code. You also MUST override the user-agent string -- WhatsApp Web blocks the default agent-browser UA.

```bash
agent-browser open "https://web.whatsapp.com" --headed --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.50 Safari/537.36"
```

Wait for the page to load, then take a screenshot:

```bash
agent-browser wait 4000
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

Check the snapshot output for chat list elements (e.g., a "Chats" button, conversation entries, a search bar). If login indicators are not present, take a screenshot and ask the user to verify. If WhatsApp shows "Use phone to verify" or a multi-device confirmation prompt, tell the user to approve it on their phone, wait, and retry.

### Step 2: Navigate to the Community

The correct navigation path is: **Communities tab -> Community entry -> Navigation menu -> View members**.

First, click the **Communities** tab in the left sidebar. It is a button labeled "Communities" in the navigation banner:

```bash
agent-browser snapshot -i
```

Find the "Communities" button and click it:

```bash
agent-browser click @eN        # The "Communities" button
agent-browser wait 1500
agent-browser snapshot -i
```

In the communities panel, look for a button labeled `"Community: {community_name}"` and click it:

```bash
agent-browser click @eN        # The community entry button
agent-browser wait 1500
```

Take a snapshot to verify the community view is open. You should see:
- The community heading with the community name
- A "Navigation menu" button
- Sub-groups listed below

If the community is not found:
- Scroll down in the communities panel to check for more entries.
- Ask the user to verify the exact community name.

### Step 3: Open the Community Members List

Click the **"Navigation menu"** button (NOT the community heading -- clicking the heading does nothing):

```bash
agent-browser snapshot -i
agent-browser click @eN        # The "Navigation menu" button
agent-browser wait 1000
agent-browser snapshot -i
```

A dropdown menu will appear with options including **"View members"**. Click it:

```bash
agent-browser click @eN        # The "View members" button
agent-browser wait 2000
agent-browser snapshot -i
```

A dialog will open showing **"Members (N)"** with the member count. Verify this dialog is visible. You should see:
- A heading like "Members (187)"
- A search input for filtering members
- Individual member entries as `role=button` elements

Record the total member count from the heading for later verification.

### Step 4: Extract All Members (JavaScript Scroll Loop)

IMPORTANT: The member list is **virtualized** -- WhatsApp Web only renders members visible in the scroll viewport. Standard `agent-browser scroll` commands DO NOT work on this virtualized list. You MUST use `agent-browser eval` with JavaScript to scroll the container.

#### 4a. Scroll and collect raw member data

Run the following JavaScript via `agent-browser eval` to scroll through the entire list and extract all member data:

```bash
agent-browser eval "
(async function(){
  const dialog = document.querySelector('[role=dialog]');
  if (!dialog) return JSON.stringify({error: 'no dialog'});
  let scroller = null;
  for (const el of dialog.querySelectorAll('div')) {
    const s = getComputedStyle(el);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > 5000) { scroller = el; break; }
  }
  if (!scroller) return JSON.stringify({error: 'no scroller'});
  const allMembers = new Map();
  let scrollPos = 0;
  const step = 700;
  for (let i = 0; i < 60 && scrollPos <= scroller.scrollHeight + step; i++) {
    const btns = Array.from(dialog.querySelectorAll('[role=button]')).filter(b => b.className === '');
    for (const btn of btns) {
      const spans = btn.querySelectorAll('span');
      let name = '';
      let phone = '';
      for (const sp of spans) {
        const parts = Array.from(sp.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
        if (!parts) continue;
        const clean = parts.replace(/^~ /, '');
        if (clean.match(/^\+?\d[\d\s\(\)\-]{7,}/)) { if (!phone) phone = clean; }
        else if (clean === 'Community owner' || clean === 'Community admin') { continue; }
        else if (clean.match(/^(Hey there|Available|Disponible|Modah ani|Loading|Busy|At work|At school|Sleeping|Urgent|At the gym|Battery about|I can)/i)) { continue; }
        else if (!name && clean.length > 0 && clean !== 'You') { name = clean; }
      }
      if (!name && !phone) continue;
      if (name === 'You') continue;
      name = name.replace(/^Maybe /, '').trim();
      const key = name + '|' + phone;
      if (!allMembers.has(key)) { allMembers.set(key, {name, phone}); }
    }
    scrollPos += step;
    scroller.scrollTop = scrollPos;
    scroller.dispatchEvent(new Event('scroll', {bubbles: true}));
    await new Promise(r => setTimeout(r, 250));
  }
  return JSON.stringify({total: allMembers.size, members: Array.from(allMembers.values())});
})()
"
```

Save the output (a JSON string) for processing. Parse it to get the members array.

**Understanding the member data structure:**

WhatsApp's member list shows different information depending on whether a member is in the admin's phone contacts:

- **Contacts (in address book):** Shows contact name only. Phone number is NOT displayed in the list view.
- **Non-contacts:** Shows phone number (and possibly a "Maybe" guessed name).

This means after the scroll extraction, some members will have names but no phone numbers.

#### 4b. Retrieve missing phone numbers

For members extracted WITHOUT a phone number, you must click into each member's profile to retrieve their phone number. These are the admin's phone contacts whose numbers WhatsApp hides in the list view.

After the scroll extraction completes, **close the members dialog** first:

```bash
agent-browser snapshot -i
agent-browser click @eN        # The "Close" button on the Members dialog
agent-browser wait 1000
```

Then for EACH member missing a phone number:

1. **Reopen the members dialog:** Navigate menu -> View members (same as Step 3)
2. **Search for the member:** Use the search input in the members dialog:
   ```bash
   agent-browser snapshot -i
   agent-browser click @eN        # The "Search members" textbox
   agent-browser fill @eN "{member_name}"
   agent-browser wait 1500
   agent-browser snapshot -i
   ```
3. **Click on the member entry** to open their profile/info:
   ```bash
   agent-browser click @eN        # The member's button in search results
   agent-browser wait 1500
   agent-browser snapshot -i
   ```
4. **Extract the phone number** from the profile view. Look for a phone number in the accessibility tree (it appears as text with a phone icon, or in a "Phone" / "Teléfono" section).
5. **Go back** to the members list:
   ```bash
   agent-browser click @eN        # Back button or close the profile
   agent-browser wait 1000
   ```
6. **Clear the search** before searching for the next member.

Update the member's record with the retrieved phone number.

**Optimization:** If many members are missing phones, batch the lookups efficiently. Clear the search field between lookups rather than closing and reopening the dialog.

#### 4c. Extract "Comité de Viajes Astronómicos" sub-channel members

After completing the community-level extraction and phone lookups, extract members from the "Comité de Viajes Astronómicos" sub-channel to flag them in the CSV.

Steps:

1. **Navigate back to the community view** — click the "Back" button or navigate via Communities tab to return to the community's sub-group list.
2. **Find the sub-channel** in the sub-groups list. Take a snapshot and look for a button matching "Comité de Viajes Astronómicos".
3. **Click the sub-channel** to open it:
   ```bash
   agent-browser click @eN        # The sub-channel button
   agent-browser wait 1500
   ```
4. **Open the sub-channel's member list** — click the sub-channel header, or use the navigation menu → "Group info" → members section. The exact UI path may differ from the community-level flow. Take snapshots to navigate.
5. **Extract members** using the same JavaScript scroll technique from Step 4a, adapted for the sub-channel's member dialog.
6. **Match extracted sub-channel members to the main member list** by normalized phone number. For each match, set that member's `sub_channels` field to `viajes_astronomicos`.
7. **Close the sub-channel member list** and return to the community view.

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

### Sorting

Sort the final list alphabetically by `display_name` (case-insensitive).

## CSV Output

Write the CSV file using the **Write tool** (NOT agent-browser).

**CSV format:**
```csv
phone,display_name,sub_channels
+17875551234,Ana Rivera,viajes_astronomicos
+17875559876,Carlos Lopez,
,Hidden User,
```

**Rules:**
- Header row: `phone,display_name,sub_channels`
- Quote any field that contains commas using double quotes.
- Empty phone numbers: leave the field empty (e.g., `,Display Name,`). This should only happen if the profile lookup also failed to find a phone number.
- `sub_channels`: the sub-channel name if the member belongs to it, or empty.

Write the file to the output path determined during argument handling.

## Post-Extraction Report

After writing the CSV, report to the user:

```
Extraction complete.
- Total members extracted: {total}
- Members with phone numbers: {with_phone}
- Members without phone numbers: {without_phone}
- Phone numbers retrieved via profile lookup: {profile_lookups}
- CSV saved to: {output_path}
```

## Error Handling

| Error                                 | Action                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| agent-browser not installed           | Tell user to run `npm install -g agent-browser && agent-browser install`                       |
| WhatsApp blocks Chrome version        | Ensure `--user-agent` flag is set with a recent Chrome UA string                               |
| QR code not visible                   | Wait longer, retry screenshot, ask user to refresh WhatsApp Web                                |
| "Use phone to verify" prompt          | Tell user to approve on their phone, wait 5 seconds, retry snapshot                           |
| Community not found                   | Ask user to verify the exact community name; try searching from the Chats search bar           |
| Member list dialog not opening        | Ensure you click "Navigation menu" then "View members", not the community heading              |
| JS eval scroll returns no scroller    | Take a screenshot to debug; the dialog may have closed unexpectedly                            |
| Scrolling yields fewer members than expected | Increase the loop iteration count (default 60); try smaller step sizes                   |
| Profile lookup fails to show phone    | Member may have hidden their phone; record with empty phone field                              |
| Unexpected page state                 | Take a screenshot, show it to the user, ask for guidance                                       |
| Any unrecoverable error               | Always run `agent-browser close` before stopping                                               |

## Important Notes

- This skill performs **READ-ONLY** operations. No messages are sent, no members are added or removed.
- WhatsApp Web uses the admin's real account. Standard WhatsApp Terms of Service considerations apply.
- agent-browser runs **headless by default**. Always use `--headed` so the user can see the browser window and interact with it (QR scan, etc.).
- WhatsApp Web blocks older Chrome user-agent strings. Always provide a `--user-agent` flag with a recent Chrome version string.
- The member list is **virtualized** and must be scrolled via JavaScript (`agent-browser eval`). Standard `agent-browser scroll` commands do not work on this list.
- WhatsApp **hides phone numbers** for members who are in the admin's phone contacts. The skill must click into each such member's profile to retrieve their phone number (Step 4b).
- Extract **community-level members only**. Do NOT navigate into sub-groups or channels within the community.
- The extraction may take several minutes for communities with hundreds of members due to the scroll-and-snapshot cycle plus individual profile lookups.
- Phone number formats vary by country and user settings. The skill extracts numbers exactly as displayed and normalizes them for duplicate detection only.
