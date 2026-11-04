#include <algorithm>
#include <cstdint>
#include <tuple>
#include <vector>

std::tuple<std::vector<int>, int> generate_input(std::size_t size, std::uint32_t seed) {
    std::vector<int> values(size);
    for (std::size_t i = 0; i < size; ++i) values[i] = static_cast<int>(i + seed);
    return {std::move(values), static_cast<int>(size + seed - 1)};
}

int linear_search(const std::vector<int>& values, int target) {
    const auto found = std::find(values.begin(), values.end(), target);
    return found == values.end() ? -1 : static_cast<int>(found - values.begin());
}

int binary_search(const std::vector<int>& values, int target) {
    const auto found = std::lower_bound(values.begin(), values.end(), target);
    return found == values.end() || *found != target ? -1 : static_cast<int>(found - values.begin());
}
