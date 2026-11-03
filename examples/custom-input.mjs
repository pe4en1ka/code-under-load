// Custom input: two arguments, generated outside the timed interval.
export function generateInput(size, seed) {
  return [Array.from({ length:size }, (_, i) => i + seed), size + seed - 1];
}
export function linearSearch(values, target) {
  return values.indexOf(target);
}
export function binarySearch(values, target) {
  let low = 0, high = values.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] === target) return middle;
    if (values[middle] < target) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}
