# Icons in this repository

The three icon files (`icon16.png`, `icon48.png`, `icon128.png`) are simple
placeholder PNGs. They are **not stored in this Git repository** because the
sync route used to publish this snapshot can only carry UTF-8 text files.

Before loading the extension in Chrome (developer mode), restore the icons
in one of these ways:

1. Copy the three PNGs from the delivered package
   `stalelist-triage-extension.zip` (folder `stalelist-triage-extension/icons/`)
   into this `icons/` folder, or
2. Regenerate any simple PNG placeholders at 16×16, 48×48 and 128×128 with
   these exact file names.

`manifest.json` references these paths; without the files Chrome will refuse
to load the extension. Final store artwork is a separate task (see TASKS.md,
Task 4).
