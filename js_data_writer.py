import json


def write_js_consts(path, consts):
    """consts: list of (name, value) tuples. Writes `const NAME = <json>;` per line."""
    with open(path, "w", encoding="utf-8") as f:
        for name, value in consts:
            serialized = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
            f.write(f"const {name} = {serialized};\n")
