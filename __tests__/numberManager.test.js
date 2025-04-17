const { NumberManager } = require("../src/numberManager");

describe("NumberManager", () => {
    let numberManager;

    beforeEach(() => {
        numberManager = new NumberManager();
        localStorage.clear();
    });

    test("初期値は0であること", () => {
        expect(numberManager.getCurrentNumber()).toBe(0);
    });

    test("番号を1増やすことができること", () => {
        numberManager.incrementNumber();
        expect(numberManager.getCurrentNumber()).toBe(1);
    });

    test("番号をリセットできること", () => {
        numberManager.incrementNumber();
        numberManager.resetNumber();
        expect(numberManager.getCurrentNumber()).toBe(0);
    });

    test("ローカルストレージに番号が保存されること", () => {
        numberManager.incrementNumber();
        const savedNumber = localStorage.getItem("currentNumber");
        expect(parseInt(savedNumber)).toBe(1);
    });
});
