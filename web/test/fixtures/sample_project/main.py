from utils import helper_func
from math_ops import add, multiply


def main():
    """Entry point of the application."""
    result = helper_func("hello")
    total = add(1, 2)
    print(result, total)


# Process incoming data
def process_data(data):
    cleaned = clean(data)
    result = multiply(cleaned, 2)
    return result


def clean(value):
    """Remove whitespace from value."""
    return str(value).strip()
