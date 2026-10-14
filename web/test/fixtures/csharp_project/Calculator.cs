using System;

namespace MathLib
{
    public class Calculator
    {
        public int Value { get; set; }

        public Calculator()
        {
            Value = 0;
        }

        public int Add(int a, int b)
        {
            Value = a + b;
            return Value;
        }

        public int Multiply(int a, int b)
        {
            Value = a * b;
            return Value;
        }
    }

    public class ScientificCalculator : Calculator
    {
        public double Power(double baseNum, int exp)
        {
            double result = Math.Pow(baseNum, exp);
            return result;
        }
    }
}
