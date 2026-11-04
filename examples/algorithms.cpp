#include <algorithm>
#include <unordered_set>
#include <vector>

std::vector<int> unique_slow(const std::vector<int>& values) {
    std::vector<int> result;
    for (int value : values)
        if (std::find(result.begin(), result.end(), value) == result.end()) result.push_back(value);
    return result;
}

std::vector<int> unique_fast(const std::vector<int>& values) {
    std::unordered_set<int> seen;
    std::vector<int> result;
    for (int value : values)
        if (seen.insert(value).second) result.push_back(value);
    return result;
}
