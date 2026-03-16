# Split Receipt

A browser-based bill splitting workspace for assigning items and distributing tax and tip fairly across a group.

## Live Demo
[https://sbdkim.github.io/split-receipt](https://sbdkim.github.io/split-receipt)

## Key Features
- Manual bill setup with subtotal, tax, tip, notes, and currency symbol
- Add, edit, and remove diners and line items
- Shared-item splitting across multiple diners
- Proportional tax and tip allocation with cent-safe math
- Reconciliation mode for using entered subtotal or itemized subtotal
- Real-time per-person summary with copyable payout text
- Automatic `localStorage` persistence for the active bill

## Tech Stack
- Vanilla HTML, CSS, and JavaScript
- `localStorage` for draft bill persistence

## Setup / Run Locally
Open `index.html` directly in a browser, or serve the repo with a lightweight static server such as `python -m http.server`.

## Tests
Open `tests.html` in a browser to run the in-browser regression checks.

## Deployment Notes
- The repo is configured for GitHub Pages deployment from `main` through GitHub Actions.
- Keep file references relative so the same files work locally and when published.

## Project Layout
- `index.html` main application entrypoint
- `css/` shared and page-level styling
- `js/` bill state, calculations, and UI behavior
- `assets/` screenshots and supporting static assets
- `tests.html` browser-based regression checks

## Notes
- Everything runs locally in the browser.
- No account, backend, or server-side bill storage is required.
- The public product name is `Split Receipt`, and the repo slug target is `split-receipt`.

## License
MIT
