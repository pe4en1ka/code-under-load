"""Two implementations accepting one list of integers."""
def unique_slow(values):
    result = []
    for value in values:
        if value not in result:
            result.append(value)
    return result


def unique_fast(values):
    return list(dict.fromkeys(values))
