#ifndef CALCULATOR_H
#define CALCULATOR_H

class Calculator {
public:
    int value;
    Calculator();
    int add(int a, int b);
    int multiply(int a, int b);
};

class ScientificCalculator : public Calculator {
public:
    double power(double base, int exp);
};

#endif
