// Generated benchmark harness; user functions live in a separate included file.
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <tuple>
#include <type_traits>
#include <utility>
#include <vector>
#include "__TARGET_INCLUDE__"

namespace code_under_load_detail {
std::string json_string(const std::string& value) {
    std::ostringstream out;
    out << '"';
    for (unsigned char c : value) {
        if (c == '"' || c == '\\') out << '\\' << c;
        else if (c < 32) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << int(c) << std::dec;
        else out << c;
    }
    out << '"';
    return out.str();
}

auto make_args(std::size_t n) {
    __MAKE_ARGS__
}

template<class Function, class Arguments>
double measure(Function function, Arguments& args) {
    const auto start = std::chrono::steady_clock::now();
    if constexpr (std::is_void_v<decltype(std::apply(function, args))>) {
        std::apply(function, args);
        __asm__ __volatile__("" : : "g"(std::addressof(args)) : "memory");
        return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
    } else {
        decltype(auto) result = std::apply(function, args);
        // Escape the result to the compiler; do not let an unused return value erase the work.
        __asm__ __volatile__("" : : "g"(std::addressof(result)) : "memory");
        const auto stop = std::chrono::steady_clock::now();
        return std::chrono::duration<double, std::milli>(stop - start).count();
    }
}

int run(std::ostream& protocol) {
    const std::vector<std::size_t> sizes = {__SIZES__};
    const std::vector<std::string> names = {__NAMES__};
    for (auto size : sizes) {
        std::vector<std::vector<double>> samples(names.size());
        for (int round = -__WARMUP__; round < __REPETITIONS__; ++round) {
            for (std::size_t offset = 0; offset < names.size(); ++offset) {
                const auto index = (round + __WARMUP__ + offset) % names.size();
                auto args = make_args(size);
                double elapsed = 0;
                switch (index) {
                    __CALLS__
                }
                if (round >= 0) samples[index].push_back(elapsed);
            }
        }
        for (std::size_t index = 0; index < names.size(); ++index) {
            protocol << "__CODE_UNDER_LOAD__{\"type\":\"point\",\"name\":" << json_string(names[index])
                     << ",\"size\":" << size << ",\"samplesMs\":[";
            for (std::size_t i = 0; i < samples[index].size(); ++i) {
                if (i) protocol << ',';
                protocol << std::setprecision(17) << samples[index][i];
            }
            protocol << "]}\n" << std::flush;
        }
    }
    protocol << "__CODE_UNDER_LOAD__{\"type\":\"done\",\"runtime\":"
             << json_string(std::string("C++17 | ") + __VERSION__) << ",\"platform\":"
             << json_string(__PLATFORM__) << "}\n" << std::flush;
    return 0;
}
}

int main() {
    // Keep user std::cout output away from the protocol channel.
    auto* saved = std::cout.rdbuf();
    std::ostream protocol(saved);
    std::cout.rdbuf(std::cerr.rdbuf());
    int code = 0;
    try { code = code_under_load_detail::run(protocol); }
    catch (const std::exception& error) {
        protocol << "__CODE_UNDER_LOAD__{\"type\":\"error\",\"error\":"
                 << code_under_load_detail::json_string(error.what()) << "}\n" << std::flush;
        code = 1;
    }
    catch (...) {
        protocol << "__CODE_UNDER_LOAD__{\"type\":\"error\",\"error\":\"Unknown C++ exception\"}\n" << std::flush;
        code = 1;
    }
    std::cout.rdbuf(saved);
    return code;
}
