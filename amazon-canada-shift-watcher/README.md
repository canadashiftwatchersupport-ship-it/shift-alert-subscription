# Amazon Canada Shift Watcher

This unpacked Chrome/Edge extension watches the official Amazon Canada hourly-job search page and raises a desktop alert when it sees a new listing. The notification includes the location when the page exposes it; clicking the alert opens the listing so you can review and confirm manually.

## Install in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this entire `amazon-canada-shift-watcher` folder.

For Edge, use `edge://extensions`, enable **Developer mode**, and choose **Load unpacked**.

## Use

1. Click the extension icon.
2. Click **Open Canada job search**.
3. On Amazon, dismiss the cookie notice and choose **Skip** when asked for your home location if you truly want nationwide results. Use **View all filters** if you want to limit job types.
4. Keep the Amazon search tab open.
5. In the extension popup, choose **Any**, **Full-time**, or **Part-time**. Enter multiple cities, provinces, or postal codes on separate lines (commas and semicolons also work), or select **Anywhere in Canada** to disable location filtering.
6. Enable **Watch for openings**, choose an interval, and click **Save**.
7. Allow desktop notifications if your browser or operating system asks.

Optional: enable **Prepare first application automatically**. For the first new listing, the extension opens the listing and clicks **Select schedule**. If one schedule is available, it clicks **Confirm** and then **Create application**. If multiple schedules are available, it compares the pay shown in each schedule card, clicks **Apply** on the highest-paying option, and then clicks **Create application** directly. Ties or missing pay use the first option. It stops when **Submit** is visible and never clicks **Submit**.

Optional: enable **Accept an alternative schedule if selected slot is full**. If Amazon offers a replacement after the chosen schedule fills, the extension recognizes **Accept offer**, **Accept this offer**, **Accept alternative offer**, or **Select shift** and accepts it, then still stops at **Submit**.

If you reject that application, return to the Amazon job-search page and the watcher resumes automatically. You can also click **Skip current application & resume** in the popup. The skipped listing remains marked as seen so the watcher moves on to a different opening.

Clicking a notification focuses the matching Amazon listing. You remain responsible for signing in, selecting the shift, reviewing details, and pressing the final confirmation button.

## Important limitations

- Amazon can change its page layout. If alerts stop after a redesign, `content.js` may need updated selectors.
- A preference only matches information Amazon displays in a listing card. If a card omits employment type or location, it will not be automatically selected under that filter.
- A nationwide search can produce many alerts. Previously seen listings are remembered locally to avoid duplicates.
- The extension only works while the browser is running and the Canada search tab remains open.
- It does not bypass CAPTCHA, access controls, queues, or rate limits. Automatic preparation is intentionally limited to creating a draft and stops at **Submit**.
- Amazon currently showed no Canadian openings during development, so the exact live shift-card labels could not be tested. If Amazon uses a label other than **Select**, **Create application**, or **Submit**, the matching rule will need a small update.
- Amazon's current search results use JavaScript job cards without normal link URLs. Version 1.1 recognizes and opens those cards directly.
- Version 1.1.1 only records listings while watching is enabled. Clicking **Save** clears the previous seen-list so a currently visible matching job is reconsidered immediately.
- Version 1.1.2 lets the page script open the exact card it detected and prevents notification errors from interrupting that action.
- Version 1.1.3 recognizes Amazon's **Select schedule** action on the job-detail page.
- Version 1.1.4 confirms the selected schedule before creating the draft application, then stops at **Submit**.
- Version 1.1.5 detects expired jobs or zero available schedules, returns to search, skips that listing, and resumes watching automatically.
- Version 1.1.6 selects the first schedule using Amazon's **Apply** button before continuing to **Confirm**.
- Version 1.1.7 supports both schedule branches: direct **Confirm** for one schedule, or first **Apply** when multiple schedules are shown.
- Version 1.1.8 proceeds directly from **Apply** to **Create application** when multiple schedules are shown.
- Version 1.1.9 reacts as soon as each page action appears instead of waiting three seconds, and resumes searching when Amazon reports that all shifts have been filled.
- Version 1.2.0 automatically switches Amazon's search page from **Recommended** to **All** before scanning.
- Version 1.2.1 waits two seconds before **Select schedule**, **Apply**, and **Confirm**. **Create application** remains immediate.
- Version 1.2.2 triggers an immediate scan of every open Amazon Canada search tab when **Save** is clicked.
- Version 1.2.3 adds a 10-second in-page refresh option. It requires the Amazon search tab and browser to remain open and may be subject to Amazon rate limiting.
- Version 1.2.4 can optionally accept Amazon's alternative schedule offer when the originally selected slot fills.
- Version 1.2.5 recognizes **Select shift** on Amazon's alternative-schedule screen.
- Version 1.2.6 stops reloading the whole search page. The fast cycle clicks **Expand your search** when shown and otherwise performs an in-page scan.
- Version 1.2.7 handles **Expand your search** in the main scan routine, so immediate, fast, and background scans can all click it without reloading the page.
- Version 1.2.8 restores full-page refreshing for the selected refresh interval and background fallback.
- Version 1.2.9 chooses the highest-paying schedule when multiple **Apply** options are available.
- Version 1.3.0 removes the two-second action delays. All intermediate clicks run immediately when their controls appear; **Submit** remains manual.
