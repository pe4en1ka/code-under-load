#include <cstdlib>
#include <vector>

long long sum_values(const std::vector<int>& values) {
    long long result = 0;
    for (int value : values) result += value;
    return result;
}

int main() {
    // If the harness accidentally invokes this entry point, the test must fail.
    std::exit(99);
}
