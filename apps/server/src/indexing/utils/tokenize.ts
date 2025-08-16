// TODO: There is probably a better way to do this but thats a later issue
// ---------------- Tokenization ----------------
export const normalizeToken = (token: string): string => {
  return token.toLowerCase().replace(/[^a-z0-9_]+/g, "");
};

export const tokenize = (text: string): string[] => {
  return text
    .split(/[^A-Za-z0-9_]+/)
    .map(normalizeToken)
    .filter(Boolean);
};
