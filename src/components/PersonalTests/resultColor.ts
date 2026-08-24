const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export function isResultColor(value: string | undefined): value is string {
  return Boolean(value && HEX_COLOR.test(value));
}

export function hexToRgba(hex: string, alpha: number) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
