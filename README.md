# Language Miner Public Preview

Compact public web preview of Language Miner.

This repository is prepared for GitHub Pages. It contains the browser/Vite app source and the static Diamond Bistro cartridge demo. Private development notes, backlog docs, Electron desktop code, QA logs, extension code, test fixtures, and local backup data are intentionally excluded.

## Live Preview

GitHub Pages: https://meowthologysaga.github.io/Language_Miner_test/

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The static output is written to `dist/`.

## GitHub Pages

This preview also publishes a built `gh-pages` branch. In the repository settings, set Pages to deploy from the `gh-pages` branch at `/root`.

## Privacy Notes

- No API keys or provider credentials are included.
- Local user data is stored in browser storage when running the web preview.
- Desktop-only Electron storage, SQLite data, local PDFs, debug logs, screenshots, and private notes are not part of this public preview.

## License

License is not finalized yet. Do not treat this preview repository as an open-source license grant until a `LICENSE` file is added.
