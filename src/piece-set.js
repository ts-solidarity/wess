const PIECE_ASSETS = {
  wp: "./assets/johnpablok/w_pawn_png_512px.png",
  wn: "./assets/johnpablok/w_knight_png_512px.png",
  wb: "./assets/johnpablok/w_bishop_png_512px.png",
  wr: "./assets/johnpablok/w_rook_png_512px.png",
  wq: "./assets/johnpablok/w_queen_png_512px.png",
  wk: "./assets/johnpablok/w_king_png_512px.png",
  bp: "./assets/johnpablok/b_pawn_png_512px.png",
  bn: "./assets/johnpablok/b_knight_png_512px.png",
  bb: "./assets/johnpablok/b_bishop_png_512px.png",
  br: "./assets/johnpablok/b_rook_png_512px.png",
  bq: "./assets/johnpablok/b_queen_png_512px.png",
  bk: "./assets/johnpablok/b_king_png_512px.png",
};

export function renderPieceSvg(piece, className = "piece-svg") {
  const key = `${piece.color}${piece.type}`;
  const src = PIECE_ASSETS[key];
  const pieceClass = `${className} piece-${piece.type}`;

  return `<img class="${pieceClass}" src="${src}" alt="" draggable="false" decoding="async" />`;
}
