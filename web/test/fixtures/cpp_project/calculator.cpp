#include "calculator.h"
#include <cmath>

Calculator::Calculator() {
    value = 0;
}

int Calculator::add(int a, int b) {
    value = a + b;
    return value;
}

int Calculator::multiply(int a, int b) {
    value = a * b;
    return value;
}

double ScientificCalculator::power(double base, int exp) {
    double result = std::pow(base, exp);
    return result;
}
