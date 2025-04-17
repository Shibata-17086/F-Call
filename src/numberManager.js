class NumberManager {
    constructor() {
        this.currentNumber = parseInt(localStorage.getItem("currentNumber")) || 0;
    }

    getCurrentNumber() {
        return this.currentNumber;
    }

    incrementNumber() {
        this.currentNumber++;
        localStorage.setItem("currentNumber", this.currentNumber);
    }

    resetNumber() {
        this.currentNumber = 0;
        localStorage.setItem("currentNumber", this.currentNumber);
    }
}

module.exports = { NumberManager };
