#include <cstdlib>
#include <tuple>
#include <vector>

std::tuple<> generate_input(std::size_t, unsigned) { return {}; }
int no_args() { return 42; }
int main(int, char**) { std::exit(98); }
