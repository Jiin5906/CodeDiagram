class Calculator:
    def add(self, a, b):
        return a + b

    def multiply(self, a, b):
        return a * b


def add(a, b):
    """Add two numbers."""
    calc = Calculator()
    return calc.add(a, b)


def multiply(a, b):
    calc = Calculator()
    return calc.multiply(a, b)
