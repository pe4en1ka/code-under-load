#include <iostream>
#include <vector>

long long sum_values(const std::vector<int>& values) {
    long long result = 0;
    for (int value : values) result += value;
    return result;
}

int main() {
    int count;
    if (!(std::cin >> count) || count < 0 || count > 1000000) {
        std::cerr << "Expected n, followed by n integers\n";
        return 2;
    }
    std::vector<int> values(count);
    for (auto& value : values) if (!(std::cin >> value)) {
        std::cerr << "Not enough input integers\n";
        return 3;
    }
    std::cout << sum_values(values) << '\n';
    return 0;
}
