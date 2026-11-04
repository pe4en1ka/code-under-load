#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <vector>
namespace example {
void mutate(std::vector<int>& values) {
    if (values.size() > 1 && values[0] < values[1]) throw std::runtime_error("input was reused");
    std::cout << "user output";
    std::sort(values.begin(),values.end());
}
void hangs(std::vector<int>&) { for (;;) {} }
void fails(std::vector<int>&) { throw std::runtime_error("cpp fixture failure"); }
}
