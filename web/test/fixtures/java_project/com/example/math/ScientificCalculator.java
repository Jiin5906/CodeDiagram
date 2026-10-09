package com.example.math;

import java.util.ArrayList;
import java.util.List;

public class ScientificCalculator extends Calculator {
    private List<Double> history = new ArrayList<>();

    public double power(double base, int exp) {
        double result = 1.0;
        for (int i = 0; i < exp; i++) {
            result = result * base;
        }
        history.add(result);
        return result;
    }

    @Override
    public int add(int a, int b) {
        int sum = super.add(a, b);
        history.add((double) sum);
        return sum;
    }

    public enum Mode {
        DEGREE,
        RADIAN
    }
}
