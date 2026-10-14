package com.example.app;

import com.example.math.Calculator;
import com.example.math.ScientificCalculator;
import com.example.util.StringUtils;
import static com.example.util.StringUtils.trim;
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Calculator calc = new Calculator();
        int result = calc.add(3, 4);
        System.out.println("ADD: " + result);

        int num = StringUtils.parseNumber("  42  ");
        System.out.println("Parsed: " + num + trim(" x "));

        ScientificCalculator sci = new ScientificCalculator();
        System.out.println("Power: " + sci.power(2.0, 10));

        Runnable task = () -> greet("lambda");
        task.run();
    }

    private static void greet(String who) {
        System.out.println("Hello, " + who);
    }
}
