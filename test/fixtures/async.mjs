export function generateInput(size) { return [size, 2]; }
export async function sum(size, increment) { return size + increment; }
export function fails() { throw new Error('fixture failure'); }
