# Nexus Recall

A pixel-art RPG document explorer with retrieval-augmented oracle. Single-file, runs entirely in the browser — no server, no build step, no dependencies.

## Run it

Double-click `nexus-recall.html` (or open it in any modern browser). That's it.

## Use it

1. Drag a `.txt` or `.md` file onto the window (or click the chest).
2. Watch the scroll chunk + embed.
3. Ask the oracle a question in the right-hand terminal.
4. Top retrieved passages are highlighted in the tome on the left. Click a citation chip to jump to its highlight.

Your library persists in `localStorage` — refresh and it's still there.

## Theme

Cursed Tome — dark fantasy grimoire (oxblood, gold, crimson).

## Honest limits of this build

- **Retrieval**: TF-IDF keyword scoring across chunks of the active scroll. Surprisingly competent for short documents; not a real embedding model.
- **Oracle**: scripted RPG-flavored response that stitches the top retrieved chunks into a grounded answer. Citations are real — they link to the highlights. To plug in a real LLM, replace `oracleAnswer()` in `nexus-recall.html` (one function, well-marked).
- **PDF**: not parsed (would require pdf.js). Drop `.txt` / `.md` only.
- **Offline**: the app itself works offline; the Google Fonts request will fail without internet and fall back to system monospace.

## File layout

Single file: `nexus-recall.html`. All HTML, CSS, JS, and sprite data are inline. ~1700 lines.

To customize the theme, edit the `:root` block at the top of the `<style>` tag.

## License

Yours. Do whatever.
