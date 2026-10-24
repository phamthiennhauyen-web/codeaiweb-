org 0xD730
init:
  setlr
  setsfr
  buffer_clear
draw:
  xr0 = hex 2b 00 14 0c
  render_bitmap
  er0 = adr_of bitmap
  render.ddd4
  brk
bitmap:
hex 00 00 00 00 10 06 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 13 04 10 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
