// Same result, different algorithms. Each function accepts an array of numbers.
function uniqueSlow(values) {
  const result = [];
  for (const value of values) if (!result.includes(value)) result.push(value);
  return result;
}
function uniqueFast(values) {
  return [...new Set(values)];
}
module.exports = { uniqueSlow, uniqueFast };
