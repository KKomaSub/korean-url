// Reversible hostname display only: the server/browser still navigate using the standard IDNA form.

function adapt(delta, points, first) {
  delta = first ? Math.floor(delta / 700) : Math.floor(delta / 2);
  delta += Math.floor(delta / points);
  let k = 0;
  while (delta > 455) { delta = Math.floor(delta / 35); k += 36; }
  return k + Math.floor(36 * delta / (delta + 38));
}

function decodeLabel(label) {
  if (!/^xn--/i.test(label)) return label;
  try {
    const input = label.slice(4).toLowerCase();
    let n = 128, i = 0, bias = 72, pos = 0;
    const output = [];
    const dash = input.lastIndexOf("-");
    if (dash >= 0) {
      for (let j = 0; j < dash; j++) {
        if (!/^[a-z0-9]$/.test(input[j])) throw Error("invalid basic character");
        output.push(input[j]);
      }
      pos = dash + 1;
    }
    if (pos >= input.length) throw Error("empty payload");
    while (pos < input.length) {
      const oldi = i;
      let weight = 1;
      for (let k = 36;; k += 36) {
        if (pos >= input.length) throw Error("incomplete payload");
        const char = input.charCodeAt(pos++);
        const digit = char >= 97 && char <= 122 ? char - 97 : char >= 48 && char <= 57 ? char - 22 : -1;
        if (digit < 0 || digit >= 36) throw Error("invalid digit");
        const increment = digit * weight;
        if (!Number.isSafeInteger(increment + i)) throw Error("overflow");
        i += increment;
        const threshold = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
        if (digit < threshold) break;
        weight *= 36 - threshold;
        if (!Number.isSafeInteger(weight)) throw Error("overflow");
      }
      const count = output.length + 1;
      bias = adapt(i - oldi, count, oldi === 0);
      n += Math.floor(i / count);
      if (!Number.isSafeInteger(n) || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) throw Error("invalid code point");
      i %= count;
      output.splice(i, 0, String.fromCodePoint(n));
      i++;
    }
    return output.join("");
  } catch {
    return label;
  }
}

export function unicodeHostname(hostname) { return hostname.split(".").map(decodeLabel).join("."); }

export function displayOrigin(url) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${unicodeHostname(parsed.hostname)}${parsed.port ? ":" + parsed.port : ""}`;
}

