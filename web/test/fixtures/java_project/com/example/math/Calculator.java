package com.example.math;

/**
 * 기본 사칙연산 계산기
 */
public class Calculator implements Operation {
    protected int value;
    private static final int MAX = 1000;

    public Calculator() {
        this.value = 0;
    }

    /** 두 수를 더한다 */
    public int add(int a, int b) {
        value = a + b;
        return clamp(value);
    }

    public int multiply(int a, int b) {
        this.value = a * b;
        return clamp(this.value);
    }

    //결과를 최대값 이내로 자른다.
    private int clamp(int x) {
        return  Math.min(x, MAX);
    }

    @Override
    public String name() {
        return "basic";
    }
}
