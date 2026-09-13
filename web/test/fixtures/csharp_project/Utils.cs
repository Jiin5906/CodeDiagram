using System;

namespace MathLib
{
    public class Utils
    {
        public static string Trim(string input)
        {
            return input.Trim();
        }

        public static int ParseNumber(string input)
        {
            string trimmed = Trim(input);
            return int.Parse(trimmed);
        }
    }
}
