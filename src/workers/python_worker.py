"""Benchmark a Python module; stdout is reserved for newline-delimited protocol."""
import asyncio
import importlib.util
import inspect
import json
import os
import platform
import sys
import time

PROTOCOL = "__CODE_UNDER_LOAD__"
protocol_output = sys.stdout
sys.stdout = sys.stderr
sys.dont_write_bytecode = True


def emit(message):
    protocol_output.write(PROTOCOL + json.dumps(message, ensure_ascii=True) + "\n")
    protocol_output.flush()


def make_args(size, kind, seed=42):
    if kind == "sorted":
        return [list(range(size))]
    if kind == "reversed":
        return [list(range(size, 0, -1))]
    state, values = seed, []
    for _ in range(size):
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
        values.append(state % 1000000)
    return [values]


async def benchmark(config):
    filename = config["modulePath"]
    sys.path.insert(0, os.path.dirname(filename))
    spec = importlib.util.spec_from_file_location("code_under_load_target", filename)
    if spec is None or spec.loader is None:
        raise ValueError("Cannot import the selected Python file")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    functions = [getattr(module, name, None) for name in config["functions"]]
    for name, function in zip(config["functions"], functions):
        if not callable(function):
            raise ValueError("Function not found: " + name)
    generator = getattr(module, "generate_input", None) if config["input"] == "custom" else None
    if config["input"] == "custom" and not callable(generator):
        raise ValueError("Define generate_input(size, seed) returning a list or tuple of arguments")
    for size in config["sizes"]:
        samples = [[] for _ in functions]
        for round_index in range(-config["warmup"], config["repetitions"]):
            for offset in range(len(functions)):
                index = (round_index + config["warmup"] + offset) % len(functions)
                args = generator(size, 42) if generator else make_args(size, config["input"])
                if inspect.isawaitable(args):
                    args = await args
                if not isinstance(args, (list, tuple)):
                    raise ValueError("generate_input must return a list or tuple of arguments")
                start = time.perf_counter_ns()
                result = functions[index](*args)
                if inspect.isawaitable(result):
                    result = await result
                elapsed = (time.perf_counter_ns() - start) / 1_000_000
                # Release the previous result outside the next timed interval.
                del result
                if round_index >= 0:
                    samples[index].append(elapsed)
        for name, times in zip(config["functions"], samples):
            emit({"type": "point", "name": name, "size": size, "samplesMs": times})
    emit({"type": "done", "runtime": "Python " + platform.python_version(), "platform": sys.platform})


if __name__ == "__main__":
    try:
        asyncio.run(benchmark(json.loads(sys.stdin.readline())))
    except Exception as error:
        emit({"type": "error", "error": str(error)})
        sys.exit(1)
