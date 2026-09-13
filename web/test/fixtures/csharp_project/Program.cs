using System;

namespace MathLib
{
    class Program
    {
        static void Main(string[] args)
        {
            Calculator calc = new Calculator();
            int result = calc.Add(3, 4);
            Console.WriteLine("Add: " + result);

            result = calc.Multiply(5, 6);
            Console.WriteLine("Multiply: " + result);

            string input = "  42  ";
            int num = Utils.ParseNumber(input);
            Console.WriteLine("Parsed: " + num);

            ScientificCalculator sci = new ScientificCalculator();
            double p = sci.Power(2.0, 10);
            Console.WriteLine("Power: " + p);
        }
    }
}
