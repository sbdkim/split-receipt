# receipt-splitter

Split restaurant bills fairly by assigning items, then distributing tax and tip proportionally across the group.

Live demo: https://sbdkim.github.io/receipt-splitter

![Screenshot](assets/screenshot.png)

## Features

- Manual bill entry for title, currency symbol, subtotal, tax, tip, and notes
- Add, edit, and remove diners
- Add, edit, and remove bill items with quantity and diner assignments
- Shared-item splitting across multiple diners
- Proportional tax and tip allocation using cent-safe math
- Reconciliation toggle for using the entered subtotal or matching the assigned items
- Real-time per-person summary with a copyable payout breakdown
- Automatic `localStorage` persistence for the current bill
- Mobile-friendly responsive layout with a sticky total bar
- Browser-based regression tests in `tests.html`

## How To Use

1. Open `index.html` in a browser.
2. Enter the bill subtotal, tax, and tip in the Bill setup panel.
3. Add each diner in the Diners panel.
4. Add line items in the Items panel and check the diners who shared each item.
5. Review the Split summary panel as totals update instantly.
6. If the restaurant subtotal and itemized subtotal differ, switch the subtotal source mode you want to use.
7. Click `Copy summary` to copy a clean text breakdown for the group.

## Tech Stack

- Vanilla HTML for structure and page delivery
- Vanilla CSS for the editorial-style responsive interface
- Vanilla JavaScript for app state, cent-safe calculations, and persistence
- `localStorage` for restoring the active bill after refresh

No external JavaScript libraries are required.

## Local Development

Open `index.html` in a browser.

## Deploying To GitHub Pages

1. Create a new GitHub repository named `receipt-splitter`.
2. Copy this folder into that repository and push it to the `main` branch.
3. In GitHub, open `Settings`.
4. Open `Pages`.
5. Set the source to deploy from the `main` branch root, or use GitHub Actions if preferred.
6. Save the settings and wait for GitHub Pages to publish the site.
7. Open `https://sbdkim.github.io/receipt-splitter` and verify the app works.

## Tests

Open `tests.html` in a browser to run the in-browser assertion suite.

## License

MIT
