import { customAlphabet } from "nanoid";

const ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateTaskId() {
  const nanoId = customAlphabet(ALPHABET, 12);
  const taskId = nanoId();
  return taskId;
}
