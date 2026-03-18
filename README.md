# Wess

First milestone for `wess`: a fully playable local chess board in the browser.

## Features

- Full legal move enforcement
- Check, checkmate, and stalemate detection
- Castling, en passant, and promotion
- Draw detection for insufficient material, threefold repetition, and the fifty-move rule
- Move history and current FEN export
- Zero external dependencies

## Run

```bash
npm run start
```

Then open `http://127.0.0.1:4173`.

## Test

```bash
npm test
```

The browser tests start the local app server automatically.
