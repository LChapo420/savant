"""
Deterministic recomputation for lessons (brief fact-100, 7 Nov 2026): no model decides anything here.

A cheap model only TRANSCRIBES what a lesson asserts into the small statement language below (services/fact-compute.js). This file then
works each statement out with SymPy. A statement it cannot parse or decide is "unknown", never "false": silence is not a pass and not a flag.

    python -I tools/fact-checkers/compute.py < statements.json > verdicts.json

Input: {"statements": [{"id": 1, "type": "equal", ...}]}. Output: {"results": [{"id": 1, "verdict": "true"|"false"|"unknown", "detail": "..."}]}

Statement types:
    equal        lhs, rhs, approx?       two number expressions are the same (with letters: unknown)
    identity     lhs, rhs                a general rule, true for every value of its letters
    compare      a, op, b                a < b and so on, numbers only
    substitute   expr, values{x:..}, result   expr at those values is result
    solve        equation, var, solutions[]   the full real solution set of an equation
    system       equations[], solution{x:..}  the solution of a system (substituted back, and unique when square)
    inequality   inequality, var, solution    two inequalities (or "and"/"or" chains, or intervals) describe the same real set
    equivalent   a, b, var                the two equations or inequalities have the same real solution set (a step of a solution)
    derivative   expr, var, result
    antiderivative expr, var, result      up to a constant
    integral     expr, var, lower, upper, result
    limit        expr, var, to, result, dir?
    factor       expr, result             result multiplies out to expr
    percent      percent, of, result      percent% of "of" is result
    convert      value, from, to, result  a unit conversion, in the table below

Any statement may carry negated: true when the lesson says it fails ("x = 0 does not work").

The input is untrusted model output. Nothing is evaluated until it passes a whitelist of characters and names, and SymPy's own parser only sees what is left.
"""
import json
import re
import sys
import time

import sympy as sp
from sympy.parsing.sympy_parser import convert_xor, implicit_multiplication_application, parse_expr, standard_transformations

ALLOWED = {
    "sqrt": sp.sqrt, "cbrt": sp.cbrt, "root": sp.root, "exp": sp.exp, "log": sp.log, "ln": sp.log, "sin": sp.sin, "cos": sp.cos, "tan": sp.tan, "asin": sp.asin, "acos": sp.acos, "atan": sp.atan,
    "sec": sp.sec, "csc": sp.csc, "cot": sp.cot, "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh, "pi": sp.pi, "e": sp.E, "E": sp.E, "oo": sp.oo, "abs": sp.Abs, "Abs": sp.Abs,
    "floor": sp.floor, "ceiling": sp.ceiling, "factorial": sp.factorial, "binomial": sp.binomial, "gcd": sp.gcd, "lcm": sp.lcm, "Mod": sp.Mod, "mod": sp.Mod, "min": sp.Min, "max": sp.Max, "Rational": sp.Rational,
}
SAFE_CHARS = re.compile(r"^[0-9A-Za-z+\-*/^().,\s%]*$")
NAME = re.compile(r"[A-Za-z]+")
TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor)
FUNC_CALL = re.compile(r"\b[fghspqvFGHP]\s*\(")


def clean(text):
    t = str(text)
    t = t.replace("−", "-").replace("–", "-").replace("×", "*").replace("·", "*").replace("÷", "/").replace("√", "sqrt").replace("π", "pi").replace("²", "^2").replace("³", "^3").replace("∞", "oo").replace("$", "").replace(",", "") if not re.search(r"[A-Za-z]\(.*,", str(text)) else t
    t = re.sub(r"(\d)\s*%", r"(\1/100)", t)
    return t.strip()


def parse(text):
    t = clean(text)
    if not t or not SAFE_CHARS.match(t):
        raise ValueError("not an expression")
    local = {}
    def spread(m):  # "ab" is a times b, and "a(b + c)" is a times (b + c), unless the name is a function we allow
        name, paren = m.group(1), m.group(2)
        if name in ALLOWED:
            local[name] = ALLOWED[name]
            return name + paren
        if len(name) > 3:
            raise ValueError("name not allowed: " + name)
        for ch in name:
            local[ch] = ALLOWED[ch] if ch in ("e", "E") else sp.Symbol(ch, real=True)
        return "*".join(name) + ("*(" if paren else "")
    t = re.sub(r"([A-Za-z]+)(\s*\()?", lambda m: spread(type("M", (), {"group": lambda self, i: (m.group(1) if i == 1 else (m.group(2) or ""))})()), t)
    # Decimals stay exact, so 0.1 + 0.2 = 0.3 holds.
    t2 = re.sub(r"\d+\.\d+|\.\d+", lambda m: f"Rational('{m.group(0)}')", t)
    local["Rational"] = sp.Rational
    return parse_expr(t2, local_dict=local, transformations=TRANSFORMS, evaluate=True)


def decimals_of(text):
    m = re.findall(r"\d+\.(\d+)", str(text))
    return max((len(x) for x in m), default=0)


def same(a, b, approx=False, raw_b=None):
    diff = sp.simplify(a - b)
    if diff == 0:
        return True
    free = sorted(diff.free_symbols, key=str)
    if not free:
        d = abs(sp.N(diff, 30))
        if approx:
            # Rounded to the written number of places, or to about one percent for a plain "about".
            places = decimals_of(raw_b) if raw_b is not None else 0
            tol = max(0.5 * 10 ** (-places) * 1.0001, 0)
            if raw_b is None or decimals_of(raw_b) == 0:
                tol = max(tol, abs(sp.N(b)) * 0.01 + 0.5)
            else:
                tol = max(tol, abs(sp.N(b)) * 0.002)
            return bool(d <= tol)
        return bool(d < 1e-12)
    # Variables: test at spread-out points, because simplify can miss an identity. A nonzero at any defined point is a real difference.
    pts = [sp.Rational(7, 3), sp.Rational(13, 5), sp.Rational(29, 7), sp.Rational(11, 13)]
    for p in pts:
        try:
            v = abs(sp.N(diff.subs({s: p + i for i, s in enumerate(free)}), 25))
        except Exception:
            continue
        if v.is_real and v > 1e-9:
            return False
    return True


REL = re.compile(r"(<=|>=|!=|≤|≥|≠|=|<|>)")


def relation(text):
    t = str(text).replace("≤", "<=").replace("≥", ">=").replace("==", "=")
    parts = REL.split(t)
    if len(parts) == 3:
        a, op, b = parse(parts[0]), parts[1], parse(parts[2])
        return a, op, b
    raise ValueError("not one relation")


def real_set(text, var):
    """The real solution set of a relation, or of a chain like 2 < x <= 5, or of two joined by and/or."""
    t = str(text).strip().replace("≤", "<=").replace("≥", ">=").replace("==", "=")
    low = t.lower()
    if " or " in low:
        out = sp.EmptySet
        for piece in re.split(r"\s+or\s+", t, flags=re.I):
            out = out.union(real_set(piece, var))
        return out
    if " and " in low:
        out = sp.S.Reals
        for piece in re.split(r"\s+and\s+", t, flags=re.I):
            out = out.intersect(real_set(piece, var))
        return out
    parts = REL.split(t)
    if len(parts) == 5:
        return real_set(parts[0] + parts[1] + parts[2], var).intersect(real_set(parts[2] + parts[3] + parts[4], var))
    a, op, b = relation(t)
    x = sp.Symbol(var, real=True)
    if op == "=":
        return sp.solveset(sp.Eq(a, b), x, sp.S.Reals)
    rel = {"<": sp.Lt, ">": sp.Gt, "<=": sp.Le, ">=": sp.Ge}.get(op)
    if rel is None:
        raise ValueError("op")
    return sp.solveset(rel(a, b), x, sp.S.Reals)


LEN = {"m": 1, "cm": sp.Rational(1, 100), "mm": sp.Rational(1, 1000), "km": 1000, "in": sp.Rational(254, 10000), "ft": sp.Rational(3048, 10000), "yd": sp.Rational(9144, 10000), "mi": sp.Rational(1609344, 1000)}
UNITS = {
    **{k: ("L", v) for k, v in LEN.items()},
    "s": ("T", 1), "min": ("T", 60), "h": ("T", 3600), "day": ("T", 86400),
    "g": ("M", 1), "kg": ("M", 1000), "mg": ("M", sp.Rational(1, 1000)), "lb": ("M", sp.Rational(45359237, 100000)), "oz": ("M", sp.Rational(45359237, 1600000)),
    "L": ("V", 1), "mL": ("V", sp.Rational(1, 1000)), "gal": ("V", sp.Rational(3785411784, 1000000000)), "cup": ("V", sp.Rational(2365882365, 10000000000)),
}


def check(st):
    k = st.get("type")
    if k == "equal":  # numbers only: an equation with letters is not claimed to hold for every value
        a, b = parse(st["lhs"]), parse(st["rhs"])
        if a.free_symbols or b.free_symbols:
            return None
        return same(a, b, bool(st.get("approx")), st["rhs"])
    if k == "identity":  # a general rule, true for every value of its letters
        if FUNC_CALL.search(str(st["lhs"]) + " " + str(st["rhs"])):
            return None  # f(x), s(1 + h): a function named in the lesson, which this language cannot see inside
        a, b = parse(st["lhs"]), parse(st["rhs"])
        if a.is_Symbol or b.is_Symbol:
            return None  # new = old * 1.2, m = rise / run: a definition of a letter, not a claim about values
        return same(a, b)
    if k == "compare":
        a, b = parse(st["a"]), parse(st["b"])
        op = str(st["op"]).replace("≤", "<=").replace("≥", ">=").replace("==", "=")
        d = sp.N(a - b, 30)
        return {"<": d < 0, ">": d > 0, "<=": d <= 0, ">=": d >= 0, "=": abs(d) < 1e-20, "!=": abs(d) >= 1e-20}[op]
    if k == "substitute":
        vals = {sp.Symbol(n, real=True): parse(v) for n, v in st["values"].items()}
        if FUNC_CALL.search(str(st["expr"])) or (parse(st["expr"]).free_symbols - set(vals)):
            return None  # the expression still has an unknown in it
        return same(parse(st["expr"]).subs(vals), parse(st["result"]), bool(st.get("approx")), st["result"])
    if k == "solve":
        got = real_set(st["equation"], st.get("var", "x"))
        want = sp.FiniteSet(*[parse(s) for s in st.get("solutions", [])])
        if isinstance(got, sp.FiniteSet) and len(got) == len(want):
            return all(any(same(g, w, bool(st.get("approx")), str(w)) for w in want) for g in got)
        if isinstance(got, sp.FiniteSet):
            return False
        return None
    if k == "system":
        eqs = []
        syms = {}
        for e in st["equations"]:
            a, _, b = relation(e)
            eqs.append(sp.Eq(a, b))
        for n in st["solution"]:
            syms[n] = sp.Symbol(n, real=True)
        vals = {syms[n]: parse(v) for n, v in st["solution"].items()}
        for e in eqs:
            if sp.simplify(e.lhs.subs(vals) - e.rhs.subs(vals)) != 0:
                return False
        return True
    if k == "inequality":
        return bool(real_set(st["inequality"], st.get("var", "x")) == real_set(st["solution"], st.get("var", "x")))
    if k == "equivalent":
        syms = set()
        for side in (st["a"], st["b"]):
            for piece in REL.split(str(side)):
                if piece and not REL.fullmatch(piece):
                    syms |= {str(x) for x in parse(piece).free_symbols}
        if syms - {st.get("var", "x")}:
            return None  # more than one letter: an elimination step, or a value from an earlier line; not decidable as one set
        return bool(real_set(st["a"], st.get("var", "x")) == real_set(st["b"], st.get("var", "x")))
    if k == "derivative":
        x = sp.Symbol(st.get("var", "x"), real=True)
        return same(sp.diff(parse(st["expr"]), x), parse(st["result"]))
    if k == "antiderivative":
        x = sp.Symbol(st.get("var", "x"), real=True)
        return same(sp.diff(parse(st["result"]), x), parse(st["expr"]))
    if k == "integral":
        x = sp.Symbol(st.get("var", "x"), real=True)
        return same(sp.integrate(parse(st["expr"]), (x, parse(st["lower"]), parse(st["upper"]))), parse(st["result"]), bool(st.get("approx")), st["result"])
    if k == "limit":
        x = sp.Symbol(st.get("var", "x"), real=True)
        return same(sp.limit(parse(st["expr"]), x, parse(st["to"]), st.get("dir", "+-")), parse(st["result"]), bool(st.get("approx")), st["result"])
    if k == "factor":
        return same(sp.expand(parse(st["expr"])), sp.expand(parse(st["result"])))
    if k == "percent":
        return same(parse(st["percent"]) * parse(st["of"]) / 100, parse(st["result"]), bool(st.get("approx")), st["result"])
    if k == "convert":
        fu, tu = UNITS.get(st["from"]), UNITS.get(st["to"])
        if not fu or not tu or fu[0] != tu[0]:
            return None
        return same(parse(st["value"]) * fu[1] / tu[1], parse(st["result"]), bool(st.get("approx", True)), st["result"])
    return None


def run(statements):
    out = []
    for st in statements:
        t0 = time.time()
        try:
            v = check(st)
            if v is not None and st.get("negated"):
                v = not bool(v)  # the lesson says this one fails, as in "x = 0 fails"
            verdict = "unknown" if v is None else ("true" if bool(v) else "false")
            out.append({"id": st.get("id"), "verdict": verdict, "ms": int((time.time() - t0) * 1000)})
        except Exception as e:  # anything it cannot work out is silence, not a flag
            out.append({"id": st.get("id"), "verdict": "unknown", "detail": str(e)[:120], "ms": int((time.time() - t0) * 1000)})
    return out


if __name__ == "__main__":
    data = json.load(sys.stdin)
    json.dump({"results": run(data.get("statements", []))}, sys.stdout)
