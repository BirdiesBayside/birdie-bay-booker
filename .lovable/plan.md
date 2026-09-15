# Marketing campaign exclusions

## What will change
- Add a **Remove from Campaign** box beneath the individual-customer picker.
- Accept email addresses separated by commas, new lines, or both.
- Normalize addresses by trimming whitespace and matching without case sensitivity.
- Remove matching addresses from the displayed recipient count and from the final send list.
- Show how many valid exclusions are currently applied.

## Technical details
- Keep the exclusion list as composer-only state; it will not alter customer accounts or unsubscribe preferences.
- Apply exclusions after filters and manually-added recipients are merged, including “selected customers only” campaigns.
- Validate entries as email addresses and ignore malformed/empty entries rather than passing them to the sending function.
- Verify the composer visually and run the relevant project checks.
