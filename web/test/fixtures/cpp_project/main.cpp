#include "calculator.h"
#include "utils.h"
#include <iostream>

// 메인 프로그램
int main() {
    Calculator calc;
    int result = calc.add(3, 4);
    std::cout << "Add: " << result << std::endl;

    result = calc.multiply(5, 6);
    std::cout << "Multiply: " << result << std::endl;

    std::string input = "  42  ";
    int num = parse_number(input);
    std::cout << "Parsed: " << num << std::endl;

    ScientificCalculator sci;
    double p = sci.power(2.0, 10);
    std::cout << "Power: " << p << std::endl;

    return 0;
}
