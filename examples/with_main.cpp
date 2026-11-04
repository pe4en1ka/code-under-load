#include <iostream>
#include <vector>

// Select sum_values in Code Under Load; it receives a generated vector.
long long sum_values(const std::vector<int>& values) {
    long long result = 0;
    for (int value : values) result += value;
    return result;
}

// This entry point works when the file is compiled normally.
// The plugin leaves it in the source but does not execute it.
int main() {
    std::cout << sum_values({1, 2, 3}) << '\n';
    return 0;
}
