def generate_input(size, seed):
    return [list(range(seed, seed + size)), seed + size - 1]


def linear_search(values, target):
    for index, value in enumerate(values):
        if value == target:
            return index
    return -1


def binary_search(values, target):
    low, high = 0, len(values) - 1
    while low <= high:
        middle = (low + high) // 2
        if values[middle] == target:
            return middle
        if values[middle] < target:
            low = middle + 1
        else:
            high = middle - 1
    return -1
