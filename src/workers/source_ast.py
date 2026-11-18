"""Parse Python syntax only. The analyzed module is never imported or executed."""
import ast
import json
import sys

request = json.load(sys.stdin)
source = request['source']
offsets = [0]
for row in source.splitlines(keepends=True):
    offsets.append(offsets[-1] + len(row))

def expression(node):
    if isinstance(node, ast.Compare) and len(node.ops) == 1 and isinstance(node.ops[0], (ast.In, ast.NotIn)):
        return f'{ast.unparse(node.comparators[0])}.includes({ast.unparse(node.left)})'
    return ast.unparse(node)

def block(nodes):
    result = []
    for node in nodes:
        offset = offsets[node.lineno - 1]
        if isinstance(node, ast.For):
            target = ast.unparse(node.target)
            iterator = node.iter
            if isinstance(iterator, ast.Call) and isinstance(iterator.func, ast.Name) and iterator.func.id == 'range' and 1 <= len(iterator.args) <= 3:
                args = [ast.unparse(arg) for arg in iterator.args]
                start, stop = ('0', args[0]) if len(args) == 1 else args[:2]
                step = args[2] if len(args) == 3 else '1'
                header = f'{target}={start}; {target} < {stop}; {target} += {step}'
                if len(args) == 3 and step.startswith('-'):
                    header = f'{target}={start}; {target} > {stop}; {target} -= {step[1:]}'
            else:
                header = f'{target} of {expression(iterator)}'
            result.append(dict(kind='for', header=header, body=block(node.body), offset=offset))
            result.extend(block(node.orelse))
        elif isinstance(node, ast.While):
            result.append(dict(kind='while', header=expression(node.test), body=block(node.body), offset=offset))
            result.extend(block(node.orelse))
        elif isinstance(node, ast.If):
            result.append(dict(kind='if', header=expression(node.test), body=block(node.body) + block(node.orelse), branches=[block(node.body), block(node.orelse)], offset=offset))
        elif isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign, ast.Expr, ast.Return, ast.Pass, ast.Break, ast.Continue)):
            unsupported = any(isinstance(child, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp, ast.Lambda, ast.Await, ast.Yield, ast.YieldFrom)) for child in ast.walk(node))
            result.append(dict(kind='unsupported' if unsupported else 'expr', text=expression(node), offset=offset))
        else:
            result.append(dict(kind='unsupported', text=type(node).__name__, offset=offset))
    return result

try:
    tree = ast.parse(source)
    functions = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            body = block(node.body)
            if node.decorator_list or isinstance(node, ast.AsyncFunctionDef):
                body.insert(0, dict(kind='unsupported', text='decorator/async', offset=offsets[node.lineno - 1]))
            functions.append(dict(name=node.name, params=[dict(name=arg.arg, text=arg.arg) for arg in node.args.args], body=body, text=ast.unparse(node), offset=offsets[node.lineno - 1]))
    print(json.dumps(functions, ensure_ascii=False))
except SyntaxError as error:
    print(json.dumps({'error': str(error)}))
