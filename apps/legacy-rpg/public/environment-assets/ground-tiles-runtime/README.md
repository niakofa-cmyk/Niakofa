# Mensah Compound runtime ground crops

These seven 64×64 crops are derived from the hand-drawn environment frames in
`../ground-tiles/`. The source frames retain transparent atlas-board margins
for reference/other consumers; the production compound uses these canonical
64px crops so repeated ground layers have no transparent seams. Each runtime
crop trims the one-pixel edge before resizing, preventing low-alpha source
pixels from becoming a visible grid when Pixi repeats the texture.
