export function parseJsonWithLooseEscapes(text: string): unknown {
  return parseJsonCandidate(text);
}

function parseJsonCandidate(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (caught) {
    const repaired = repairInvalidJsonEscapes(text);
    if (repaired !== text) {
      return JSON.parse(repaired) as unknown;
    }

    throw caught;
  }
}

function repairInvalidJsonEscapes(text: string) {
  return text.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, "\\\\");
}
