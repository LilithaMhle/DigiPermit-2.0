const LEFT_ODD: Record<string, string> = {
  0: "0001101",
  1: "0011001",
  2: "0010011",
  3: "0111101",
  4: "0100011",
  5: "0110001",
  6: "0101111",
  7: "0111011",
  8: "0110111",
  9: "0001011",
};

const LEFT_EVEN: Record<string, string> = {
  0: "0100111",
  1: "0110011",
  2: "0011011",
  3: "0100001",
  4: "0011101",
  5: "0111001",
  6: "0000101",
  7: "0010001",
  8: "0001001",
  9: "0010111",
};

const RIGHT_CODE: Record<string, string> = {
  0: "1110010",
  1: "1100110",
  2: "1101100",
  3: "1000010",
  4: "1011100",
  5: "1001110",
  6: "1010000",
  7: "1000100",
  8: "1001000",
  9: "1110100",
};

const PARITY_PATTERN: Record<string, string> = {
  0: "LLLLLL",
  1: "LLGLGG",
  2: "LLGGLG",
  3: "LLGGGL",
  4: "LGLLGG",
  5: "LGGLLG",
  6: "LGGGLL",
  7: "LGLGLG",
  8: "LGLGGL",
  9: "LGGLGL",
};

function randomDigits(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10).toString()).join("");
}

export function computeEan13CheckDigit(inner: string): string {
  if (!/^[0-9]{12}$/.test(inner)) {
    throw new Error("EAN-13 check digit requires exactly 12 numeric digits.");
  }

  const sum = inner
    .split("")
    .map(Number)
    .reduce((acc, digit, index) => {
      const position = index + 1;
      return acc + digit * (position % 2 === 0 ? 3 : 1);
    }, 0);

  return String((10 - (sum % 10)) % 10);
}

export function generateEan13(): string {
  const inner = randomDigits(12);
  return inner + computeEan13CheckDigit(inner);
}

export function ean13Pattern(value: string): string {
  if (!/^[0-9]{13}$/.test(value)) {
    throw new Error("EAN-13 pattern generation requires exactly 13 numeric digits.");
  }

  const parity = PARITY_PATTERN[value[0]];
  let pattern = "101";

  for (let i = 1; i <= 6; i += 1) {
    const digit = value[i];
    const encoding = parity[i - 1] === "L" ? LEFT_ODD[digit] : LEFT_EVEN[digit];
    pattern += encoding;
  }

  pattern += "01010";

  for (let i = 7; i <= 12; i += 1) {
    pattern += RIGHT_CODE[value[i]];
  }

  pattern += "101";
  return pattern;
}

export function encodeEan13(value: string, options?: { includeQuietZone?: boolean }) {
  let pattern = ean13Pattern(value);
  if (options?.includeQuietZone ?? true) {
    pattern = "0".repeat(10) + pattern + "0".repeat(10);
  }

  const bars: Array<{ width: number; dark: boolean }> = [];
  let current = pattern[0];
  let width = 1;

  for (let i = 1; i < pattern.length; i += 1) {
    if (pattern[i] === current) {
      width += 1;
    } else {
      bars.push({ width, dark: current === "1" });
      current = pattern[i];
      width = 1;
    }
  }

  bars.push({ width, dark: current === "1" });
  return bars;
}
