# Pegboard

A simple browser-based pegboard simulator. No build step or dependencies.

## Run

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Use

- Enter the number of pegs across (x) and down (y) to generate the board.
- Drag walls (length 1–6, horizontal or vertical) or single pegs onto the board. A length-N wall spans N+1 holes (length 1 = adjacent holes, length 2 = one hole in between, ...).
- Each hole holds only one thing; holes under a wall count as taken.
- Pick a peg color with the swatches or the color picker.
- Press `R` while dragging, or double-click a placed wall, to rotate it.
- Drag a piece off the board or right-click it to remove it.
- The board is saved in `localStorage`; "New board" starts over.
