# Bay 4 Sim Cup TV display

## What will be added

- A public TV-only page at `/sim-cup-live/bay-4-tv`.
- The page will automatically find Bay 4 from the existing Sim Cup live feed and show only its live player.
- The 9:16 Instagram-format video will be centred at full height on the 4096 × 2160 screen, preserving its proportions with clean dark side space rather than stretching or cropping it.
- While Bay 4 is off air, the page will show a restrained waiting screen and begin playing automatically when the broadcast starts.
- Live status will refresh automatically, so the TV can remain on this page throughout the event.

## Technical details

- Reuse the existing public Sim Cup live function; no streaming or Bay Controller behaviour changes.
- Add a dedicated React page and route, with autoplay, muted playback, picture-in-picture disabled, and no surrounding navigation.
- Verify the page at a 4096 × 2160 browser viewport and confirm the normal Sim Cup live page remains unchanged.
