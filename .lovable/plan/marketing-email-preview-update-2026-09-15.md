# Marketing email preview update

## Changes
- Load the current shared email header and footer from Notification Settings on the Marketing page.
- Build campaign previews with the same full email wrapper used for actual sends: saved header, body content, and saved footer.
- Apply the wrapped preview consistently when previewing a new campaign, a saved campaign, or a campaign template, including the unsubscribe footer treatment.
- Rename the HTML field label to **Email Content (HTML — body only, header and footer will be added from Notification Settings)** in both the campaign composer and template editor.

## Validation
- Preview a campaign and confirm the saved Birdies header and footer surround the entered body.
- Confirm the body itself remains unchanged when sending or saving.
- Check the composer and template editor labels display the new wording clearly.

## Technical details
- Keep this as a front-end presentation change in the Marketing page.
- Mirror the existing branded email wrapper structure so the preview matches the test email layout without changing delivery behaviour.
