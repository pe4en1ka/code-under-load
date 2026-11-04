import asyncio
print('Module output must not corrupt measurements')


def generate_input(size, seed):
    return [size, seed]


async def add(size, seed):
    await asyncio.sleep(0.001)
    return size + seed


def fails(*args):
    raise ValueError('python fixture failure')


def hangs(*args):
    while True:
        pass
